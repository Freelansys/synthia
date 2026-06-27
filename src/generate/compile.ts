import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type ObjectDeclaration } from 'spex-parser'
import { DirectedGraph } from 'graphology'
import { topologicalSort as dagTopologicalSort } from 'graphology-dag'
import { subgraph as dagSubgraph } from 'graphology-operators'
import { logger } from '../logger.js'
import { SCCResult } from '../workspace/graph.js'
import {
  Workspace,
  BUILTIN_ID_PREFIX,
  objectId,
  type EntryDeclaration,
} from '../workspace/index.js'
import { type LLMConfig, generateCode } from './llm.js'
import { buildSystemPrompt, buildUserPrompt, renderDeclarationsForContext } from './prompts.js'
import { mergeGeneratedCode } from './merge/index.js'

export interface CompileConfig {
  targetLanguage: string
  llm?: LLMConfig
  archStyle?: string
  functional?: boolean
}

export function extractSubgraph(cg: DirectedGraph, rootComp: number): DirectedGraph {
  const reachable = new Set<string>()
  const queue = [String(rootComp)]
  reachable.add(String(rootComp))

  while (queue.length > 0) {
    const comp = queue.pop()!
    for (const neighbor of cg.outNeighbors(comp)) {
      if (!reachable.has(neighbor)) {
        reachable.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  return dagSubgraph(cg, reachable)
}

export function topologicalSort(graph: DirectedGraph): string[] {
  return dagTopologicalSort(graph).reverse()
}

function objectHash(decl: ObjectDeclaration): string {
  return createHash('sha256').update(JSON.stringify(decl)).digest('hex')
}

export function isAbstract(id: string, workspace: Workspace, callGraph: DirectedGraph): boolean {
  if (!callGraph.hasNode(id)) return false
  if (callGraph.outDegree(id) > 0 || callGraph.inDegree(id) > 0) return false

  const decl = workspace.getObject(id)
  if (!decl) return false

  return decl.object.kind === 'SubObject'
}

export async function compileEntryPoint(
  workspace: Workspace,
  callGraph: DirectedGraph,
  typeGraph: DirectedGraph,
  scc: SCCResult,
  cg: DirectedGraph,
  entryPoint: { filePath: string; declaration: EntryDeclaration },
  cacheDir: string,
  outputDir: string,
  config: CompileConfig
): Promise<{ artifacts: string[]; outputFiles: string[] }> {
  const entryId =
    workspace.resolveName(entryPoint.declaration.name, entryPoint.filePath) ??
    objectId(entryPoint.filePath, entryPoint.declaration.name)
  const rootComp = scc.getComp(entryId)
  if (rootComp === undefined) {
    logger.warn(`entry point ${entryPoint.declaration.name} not found in SCC map`)
    return { artifacts: [], outputFiles: [] }
  }

  const generatedCodeMap = new Map<string, string>()
  const artifacts: string[] = []
  const order: string[] = []
  const compiled = new Set<number>()

  async function compileSCC(compIdx: number): Promise<void> {
    if (compiled.has(compIdx)) return
    compiled.add(compIdx)

    for (const depCompStr of cg.outNeighbors(String(compIdx))) {
      await compileSCC(Number(depCompStr))
    }

    const nodeIds = scc.getNodes(compIdx) ?? []

    const siblingDecls: ObjectDeclaration[] = []
    for (const id of nodeIds) {
      const decl = workspace.getObject(id)
      if (decl) siblingDecls.push(decl)
    }
    const siblingDeclarationsStr = renderDeclarationsForContext(siblingDecls)

    for (const id of nodeIds) {
      if (id.startsWith(BUILTIN_ID_PREFIX)) {
        logger.debug(`skip built-in: ${id}`)
        continue
      }

      const decl = workspace.getObject(id)
      if (!decl) continue

      const langCacheDir = resolve(cacheDir, config.targetLanguage)
      const hash = objectHash(decl)
      const artifactPath = resolve(langCacheDir, `obj-${hash}.json`)

      if (existsSync(artifactPath)) {
        artifacts.push(artifactPath)
        logger.debug(`cache hit for ${id}`)
        try {
          const cached = JSON.parse(readFileSync(artifactPath, 'utf-8'))
          if (cached.generatedCode) {
            generatedCodeMap.set(id, cached.generatedCode)
          }
        } catch {
          logger.debug(`failed to read cached code for ${id}`)
        }
        continue
      }

      if (isAbstract(id, workspace, callGraph)) {
        logger.debug(`skip abstract object: ${id}`)
        continue
      }

      logger.info(`  generating ${id}`)
      mkdirSync(langCacheDir, { recursive: true })

      let generatedCode: string | undefined

      if (config.llm) {
        const depCodeParts: string[] = []
        for (const depId of callGraph.outNeighbors(id)) {
          const code = generatedCodeMap.get(depId)
          if (code) depCodeParts.push(`// ${depId}\n${code}`)
        }
        const dependencyCode = depCodeParts.join('\n\n')

        const systemPrompt = buildSystemPrompt({
          targetLanguage: config.targetLanguage,
          ...(config.archStyle !== undefined && { archStyle: config.archStyle }),
          ...(config.functional !== undefined && { functional: config.functional }),
        })

        const userPrompt = buildUserPrompt({
          decl,
          dependencyCode,
          siblingDeclarations: siblingDeclarationsStr,
          targetLanguage: config.targetLanguage,
          workspace,
          sourceId: id,
          ...(config.archStyle !== undefined && { archStyle: config.archStyle }),
          ...(config.functional !== undefined && { functional: config.functional }),
        })

        try {
          generatedCode = await generateCode({ systemPrompt, userPrompt, config: config.llm })
          generatedCodeMap.set(id, generatedCode)
          logger.debug(`  generated ${generatedCode.length} chars for ${id}`)
        } catch (err) {
          logger.warn(`  LLM call failed for ${id}: ${(err as Error).message}`)
        }
      }

      const payload: Record<string, unknown> = { objectId: id, declaration: decl }
      if (generatedCode !== undefined) {
        payload.generatedCode = generatedCode
      }

      const payloadStr = JSON.stringify(payload, null, 2)
      writeFileSync(artifactPath, payloadStr, 'utf-8')

      artifacts.push(artifactPath)
    }

    order.push(String(compIdx))
  }

  await compileSCC(rootComp)

  logger.info(
    `compiling entry point "${entryPoint.declaration.name}": ${order.length} component(s)`
  )

  const outputFiles = mergeGeneratedCode(
    workspace,
    callGraph,
    typeGraph,
    scc,
    order,
    generatedCodeMap,
    outputDir,
    config.targetLanguage
  )

  return { artifacts, outputFiles }
}

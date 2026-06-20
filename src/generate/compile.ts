import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type ObjectDeclaration } from 'spex-parser'
import { DirectedGraph } from 'graphology'
import { topologicalSort as dagTopologicalSort } from 'graphology-dag'
import { subgraph as dagSubgraph } from 'graphology-operators'
import { logger } from '../logger.js'
import { SCCResult } from '../workspace/graph.js'
import { Workspace, objectId, type EntryDeclaration } from '../workspace/index.js'
import { type LLMConfig, generateCode } from './llm.js'
import { buildSystemPrompt, buildUserPrompt, renderDeclarationsForContext } from './prompts.js'

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

export async function compileEntryPoint(
  workspace: Workspace,
  depGraph: DirectedGraph,
  scc: SCCResult,
  cg: DirectedGraph,
  entryPoint: { filePath: string; declaration: EntryDeclaration },
  cacheDir: string,
  llmConfig?: LLMConfig,
  archConfig?: {
    style?: string
    functional?: boolean
  }
): Promise<string[]> {
  const targetLanguage = 'typescript'

  const entryId =
    workspace.resolveName(entryPoint.declaration.name, entryPoint.filePath) ??
    objectId(entryPoint.filePath, entryPoint.declaration.name)
  const rootComp = scc.getComp(entryId)
  if (rootComp === undefined) {
    logger.warn(`entry point ${entryPoint.declaration.name} not found in SCC map`)
    return []
  }

  const subgraph = extractSubgraph(cg, rootComp)
  const order = topologicalSort(subgraph)

  logger.info(
    `compiling entry point "${entryPoint.declaration.name}": ${order.length} component(s)`
  )

  const generatedCodeMap = new Map<string, string>()
  const artifacts: string[] = []

  for (const compStr of order) {
    const comp = Number(compStr)
    const nodeIds = scc.getNodes(comp) ?? []

    const siblingDecls: ObjectDeclaration[] = []
    for (const id of nodeIds) {
      const decl = workspace.getObject(id)
      if (decl) siblingDecls.push(decl)
    }
    const siblingDeclarationsStr = renderDeclarationsForContext(siblingDecls)

    for (const id of nodeIds) {
      const decl = workspace.getObject(id)
      if (!decl) continue

      const hash = objectHash(decl)
      const artifactPath = resolve(cacheDir, `obj-${hash}.json`)

      if (existsSync(artifactPath)) {
        artifacts.push(artifactPath)
        logger.debug(`cache hit for ${id}`)
        continue
      }

      logger.info(`  generating ${id}`)
      mkdirSync(cacheDir, { recursive: true })

      let generatedCode: string | undefined

      if (llmConfig) {
        const depCodeParts: string[] = []
        for (const depId of depGraph.outNeighbors(id)) {
          const code = generatedCodeMap.get(depId)
          if (code) depCodeParts.push(`// ${depId}\n${code}`)
        }
        const dependencyCode = depCodeParts.join('\n\n')

        const systemPrompt = buildSystemPrompt({
          targetLanguage,
          ...(archConfig?.style !== undefined && { archStyle: archConfig.style }),
          ...(archConfig?.functional !== undefined && { functional: archConfig.functional }),
        })

        const userPrompt = buildUserPrompt({
          decl,
          dependencyCode,
          siblingDeclarations: siblingDeclarationsStr,
          targetLanguage,
          ...(archConfig?.style !== undefined && { archStyle: archConfig.style }),
          ...(archConfig?.functional !== undefined && { functional: archConfig.functional }),
        })

        generatedCode = await generateCode({ systemPrompt, userPrompt, config: llmConfig })
        generatedCodeMap.set(id, generatedCode)
        logger.debug(`  generated ${generatedCode.length} chars for ${id}`)
      }

      const payload: Record<string, unknown> = { objectId: id, declaration: decl }
      if (generatedCode !== undefined) {
        payload.generatedCode = generatedCode
      }

      const payloadStr = JSON.stringify(payload, null, 2)
      writeFileSync(artifactPath, payloadStr, 'utf-8')

      artifacts.push(artifactPath)
    }
  }

  return artifacts
}

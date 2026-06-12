import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type ObjectDeclaration } from 'spex-parser'
import { DirectedGraph } from 'graphology'
import { topologicalSort as dagTopologicalSort } from 'graphology-dag'
import { subgraph as dagSubgraph } from 'graphology-operators'
import { logger } from '../logger.js'
import { SCCResult } from '../workspace/graph.js'
import {
  Workspace,
  objectId,
  type ArtifactCache,
  type EntryDeclaration,
} from '../workspace/index.js'

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

export function compileEntryPoint(
  workspace: Workspace,
  scc: SCCResult,
  cg: DirectedGraph,
  entryPoint: { filePath: string; declaration: EntryDeclaration },
  cacheDir: string
): string[] {
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

  const cache: ArtifactCache = workspace.artifactCache
  const artifacts: string[] = []
  for (const compStr of order) {
    const comp = Number(compStr)
    const nodeIds = scc.getNodes(comp) ?? []

    for (const id of nodeIds) {
      const decl = workspace.getObject(id)
      if (!decl) continue

      const cached = cache.get(id)
      if (cached) {
        artifacts.push(cached)
        logger.debug(`cache hit for ${id}`)
        continue
      }

      const hash = objectHash(decl)
      const artifactPath = resolve(cacheDir, `obj-${hash}.json`)

      try {
        readFileSync(artifactPath, 'utf-8')
      } catch {
        logger.info(`  generating ${id}`)
        mkdirSync(cacheDir, { recursive: true })
        const payload = JSON.stringify({ objectId: id, declaration: decl }, null, 2)
        writeFileSync(artifactPath, payload, 'utf-8')
      }

      cache.set(id, artifactPath)
      artifacts.push(artifactPath)
    }
  }

  return artifacts
}

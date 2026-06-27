import { relative, resolve } from 'node:path'
import { type DirectedGraph } from 'graphology'
import { SCCResult } from '../../workspace/graph.js'
import { Workspace, BUILTIN_ID_PREFIX } from '../../workspace/index.js'
import { typescriptMerge } from './typescript.js'
import { pythonMerge } from './python.js'

export interface MergerParams {
  workspace: Workspace
  callGraph: DirectedGraph
  typeGraph: DirectedGraph
  scc: SCCResult
  order: string[]
  generatedCodeMap: Map<string, string>
  outputDir: string
}

const registry: Record<string, (params: MergerParams) => string[]> = {
  typescript: typescriptMerge,
  javascript: typescriptMerge,
  python: pythonMerge,
}

export function mergeGeneratedCode(
  workspace: Workspace,
  callGraph: DirectedGraph,
  typeGraph: DirectedGraph,
  scc: SCCResult,
  order: string[],
  generatedCodeMap: Map<string, string>,
  outputDir: string,
  language: string
): string[] {
  const merger = registry[language]
  if (!merger) throw new Error(`unsupported target language for merge: ${language}`)
  return merger({ workspace, callGraph, typeGraph, scc, order, generatedCodeMap, outputDir })
}

// ── Shared helpers ──────────────────────────────────────────

export function collectBuiltinFiltered(scc: SCCResult, comp: number): string[] {
  return (scc.getNodes(comp) ?? []).filter((id) => !id.startsWith(BUILTIN_ID_PREFIX))
}

export function sortedObjectNames(workspace: Workspace, ids: string[]): string[] {
  return ids.map((id) => workspace.getObject(id)?.name ?? 'Unknown').sort()
}

export function resolveImports(
  workspace: Workspace,
  callGraph: DirectedGraph,
  typeGraph: DirectedGraph,
  scc: SCCResult,
  ids: string[],
  currentComp: number,
  compToBaseName: Map<number, string>,
  outputDir: string,
  currentDir: string
): Map<string, Set<string>> {
  const importMap = new Map<string, Set<string>>()

  for (const id of ids) {
    const depIds = new Set<string>()
    for (const neighbor of callGraph.outNeighbors(id)) depIds.add(neighbor)
    for (const neighbor of typeGraph.outNeighbors(id)) depIds.add(neighbor)

    for (const depId of depIds) {
      if (depId.startsWith(BUILTIN_ID_PREFIX)) continue
      const depComp = scc.getComp(depId)
      if (depComp === undefined || depComp === currentComp) continue

      const depBaseName = compToBaseName.get(depComp)
      if (!depBaseName) continue

      const depDecl = workspace.getObject(depId)
      const depName = depDecl?.name
      if (!depName) continue

      const depBasePath = resolve(outputDir, depBaseName)
      let relPath = relative(currentDir, depBasePath)
      if (!relPath.startsWith('.')) relPath = `./${relPath}`

      if (!importMap.has(relPath)) importMap.set(relPath, new Set())
      importMap.get(relPath)!.add(depName)
    }
  }

  return importMap
}

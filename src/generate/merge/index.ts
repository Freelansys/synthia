import { relative, resolve } from 'node:path'
import { type DirectedGraph } from 'graphology'
import { SCCResult } from '../../workspace/graph.js'
import { Workspace, BUILTIN_NAMESPACE } from '../../workspace/index.js'
import { typescriptMerge } from './typescript.js'
import { pythonMerge } from './python.js'

export interface MergerParams {
  workspace: Workspace
  depGraph: DirectedGraph
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
  depGraph: DirectedGraph,
  scc: SCCResult,
  order: string[],
  generatedCodeMap: Map<string, string>,
  outputDir: string,
  language: string
): string[] {
  const merger = registry[language]
  if (!merger) throw new Error(`unsupported target language for merge: ${language}`)
  return merger({ workspace, depGraph, scc, order, generatedCodeMap, outputDir })
}

// ── Shared helpers ──────────────────────────────────────────

export function collectBuiltinFiltered(scc: SCCResult, comp: number): string[] {
  return (scc.getNodes(comp) ?? []).filter((id) => !id.startsWith(`file://${BUILTIN_NAMESPACE}::`))
}

export function sortedObjectNames(workspace: Workspace, ids: string[]): string[] {
  return ids.map((id) => workspace.getObject(id)?.name ?? 'Unknown').sort()
}

export function resolveImports(
  workspace: Workspace,
  depGraph: DirectedGraph,
  scc: SCCResult,
  ids: string[],
  currentComp: number,
  compToBaseName: Map<number, string>,
  outputDir: string,
  currentDir: string
): Map<string, Set<string>> {
  const importMap = new Map<string, Set<string>>()

  for (const id of ids) {
    for (const depId of depGraph.outNeighbors(id)) {
      if (depId.startsWith(`file://${BUILTIN_NAMESPACE}::`)) continue
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

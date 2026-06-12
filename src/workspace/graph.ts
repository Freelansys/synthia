import { type ObjectExpression } from 'spex-parser'
import { Workspace } from './index.js'
import { DirectedGraph } from 'graphology'
import { stronglyConnectedComponents } from 'graphology-components'
import { logger } from '../logger.js'

function collectExpressionRefs(expr: ObjectExpression, refs: string[]): void {
  switch (expr.kind) {
    case 'NamedObject':
      refs.push(expr.name)
      break
    case 'ProductObject':
      for (const field of Object.values(expr.fields)) {
        collectExpressionRefs(field, refs)
      }
      break
    case 'ExponentialObject':
      collectExpressionRefs(expr.base, refs)
      collectExpressionRefs(expr.exponent, refs)
      break
    case 'SubObject':
      collectExpressionRefs(expr.base, refs)
      for (const part of expr.constraint.parts) {
        if (part.kind === 'ConstraintReference') {
          refs.push(part.name)
        }
      }
      break
    case 'ArrayObject':
      collectExpressionRefs(expr.base, refs)
      break
  }
}

export function buildDependencyGraph(workspace: Workspace) {
  const graph = new DirectedGraph({ allowSelfLoops: false })

  for (const [id] of workspace.allObjects()) {
    graph.addNode(id)
  }

  let edgeCount = 0
  for (const [sourceId, decl] of workspace.allObjects()) {
    const refs: string[] = []
    collectExpressionRefs(decl.object, refs)

    const filePath = sourceId.startsWith('file://') ? sourceId.slice(7).split('::')[0] : undefined

    const seen = new Set<string>()
    for (const name of refs) {
      const targetId = workspace.resolveName(name, filePath)
      if (targetId && targetId !== sourceId && !seen.has(targetId)) {
        seen.add(targetId)
        graph.addEdge(sourceId, targetId)
        edgeCount++
      }
    }
  }

  logger.info(`dependency graph: ${graph.order} node(s), ${edgeCount} edge(s)`)
  return graph
}

export class SCCResult {
  readonly nodeToComp: Map<string, number>
  readonly compToNodes: Map<number, string[]>

  constructor(graph: DirectedGraph) {
    const components = stronglyConnectedComponents(graph)
    const nodeToComp = new Map<string, number>()
    const compToNodes = new Map<number, string[]>()

    for (const [i, nodes] of components.entries()) {
      for (const node of nodes) {
        nodeToComp.set(node, i)
      }
      compToNodes.set(i, [...nodes])
    }

    this.nodeToComp = nodeToComp
    this.compToNodes = compToNodes
    logger.info(`SCC: ${compToNodes.size} component(s) for ${nodeToComp.size} node(s)`)
  }

  getComp(node: string): number | undefined {
    return this.nodeToComp.get(node)
  }

  getNodes(comp: number): string[] | undefined {
    return this.compToNodes.get(comp)
  }
}

export function computeSCC(graph: DirectedGraph): SCCResult {
  return new SCCResult(graph)
}

export function condensationGraph(graph: DirectedGraph, scc: SCCResult): DirectedGraph {
  const cg = new DirectedGraph({ allowSelfLoops: false })

  for (const id of scc.compToNodes.keys()) {
    cg.addNode(String(id))
  }

  const seen = new Set<string>()
  for (const entry of graph.edgeEntries()) {
    const sourceComp = scc.getComp(entry.source)
    const targetComp = scc.getComp(entry.target)
    if (sourceComp !== undefined && targetComp !== undefined && sourceComp !== targetComp) {
      const key = `${sourceComp}->${targetComp}`
      if (!seen.has(key)) {
        seen.add(key)
        cg.addEdge(String(sourceComp), String(targetComp))
      }
    }
  }

  logger.info(`condensation graph: ${cg.order} node(s), ${cg.size} edge(s)`)
  return cg
}

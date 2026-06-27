import { type ObjectExpression } from 'spex-parser'
import { Workspace } from './index.js'
import { DirectedGraph } from 'graphology'
import { stronglyConnectedComponents } from 'graphology-components'
import { logger } from '../logger.js'

function collectExpressionRefs(
  expr: ObjectExpression,
  typeRefs: string[],
  callRefs: string[]
): void {
  switch (expr.kind) {
    case 'NamedObject':
      typeRefs.push(expr.name)
      break
    case 'ProductObject':
      for (const field of Object.values(expr.fields)) {
        collectExpressionRefs(field, typeRefs, callRefs)
      }
      break
    case 'ExponentialObject':
      collectExpressionRefs(expr.base, typeRefs, callRefs)
      collectExpressionRefs(expr.exponent, typeRefs, callRefs)
      break
    case 'SubObject':
      collectExpressionRefs(expr.base, typeRefs, callRefs)
      for (const part of expr.constraint.parts) {
        if (part.kind === 'ConstraintReference') {
          callRefs.push(part.name)
        }
      }
      break
    case 'ArrayObject':
      collectExpressionRefs(expr.base, typeRefs, callRefs)
      break
  }
}

export function buildDependencyGraphs(workspace: Workspace) {
  const typeGraph = new DirectedGraph({ allowSelfLoops: false })
  const callGraph = new DirectedGraph({ allowSelfLoops: false })

  for (const [id] of workspace.allObjects()) {
    typeGraph.addNode(id)
    callGraph.addNode(id)
  }

  let typeEdgeCount = 0
  let callEdgeCount = 0
  for (const [sourceId, decl] of workspace.allObjects()) {
    const typeRefs: string[] = []
    const callRefs: string[] = []
    collectExpressionRefs(decl.object, typeRefs, callRefs)

    const filePath = sourceId.startsWith('file://') ? sourceId.slice(7).split('::')[0] : undefined

    const seenType = new Set<string>()
    for (const name of typeRefs) {
      const targetId = workspace.resolveName(name, filePath)
      if (targetId && targetId !== sourceId && !seenType.has(targetId)) {
        seenType.add(targetId)
        typeGraph.addEdge(sourceId, targetId)
        typeEdgeCount++
      }
    }

    const seenCall = new Set<string>()
    for (const name of callRefs) {
      const targetId = workspace.resolveName(name, filePath)
      if (targetId && targetId !== sourceId && !seenCall.has(targetId)) {
        seenCall.add(targetId)
        callGraph.addEdge(sourceId, targetId)
        callEdgeCount++
      }
    }
  }

  logger.info(`type graph: ${typeGraph.order} node(s), ${typeEdgeCount} edge(s)`)
  logger.info(`call graph: ${callGraph.order} node(s), ${callEdgeCount} edge(s)`)
  return { typeGraph, callGraph }
}

export function combineGraphs(a: DirectedGraph, b: DirectedGraph): DirectedGraph {
  const union = new DirectedGraph({ allowSelfLoops: false })
  for (const node of a.nodes()) {
    union.addNode(node)
  }
  for (const node of b.nodes()) {
    if (!union.hasNode(node)) union.addNode(node)
  }
  for (const entry of a.edgeEntries()) {
    union.addEdge(entry.source, entry.target)
  }
  for (const entry of b.edgeEntries()) {
    if (!union.hasEdge(entry.source, entry.target)) {
      union.addEdge(entry.source, entry.target)
    }
  }
  return union
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

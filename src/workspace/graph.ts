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

export function computeSCC(graph: DirectedGraph): Map<string, number> {
  const components = stronglyConnectedComponents(graph)
  const map = new Map<string, number>()
  for (const [i, nodes] of components.entries()) {
    for (const node of nodes) {
      map.set(node, i)
    }
  }
  logger.info(`SCC: ${components.length} component(s) for ${map.size} node(s)`)
  return map
}

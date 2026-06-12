import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { DirectedGraph } from 'graphology'
import { loadSpexSpecs, loadSpexSpecsRecursive } from '../src/parse/index.js'
import { Workspace, objectId } from '../src/workspace/index.js'
import { buildDependencyGraph, computeSCC } from '../src/workspace/graph.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const propsDir = resolve(__dirname, 'props')
const specsDir = resolve(propsDir, 'specs')
const importsDir = resolve(propsDir, 'imports')

describe('buildDependencyGraph', () => {
  let workspace: Workspace
  let graph: DirectedGraph

  beforeAll(() => {
    workspace = new Workspace(loadSpexSpecs(specsDir))
    graph = buildDependencyGraph(workspace)
  })

  it('includes all workspace objects as nodes', () => {
    expect(graph.order).toBe(workspace.objects.size)
  })

  it('creates edges for NamedObject references', () => {
    const addTodoId = objectId(resolve(specsDir, 'model.spex'), 'AddTodo')
    const todoId = objectId(resolve(specsDir, 'model.spex'), 'Todo')

    expect(graph.hasEdge(addTodoId, todoId)).toBe(true)
  })

  it('does not create self-loop edges', () => {
    for (const [id] of workspace.allObjects()) {
      expect(graph.hasEdge(id, id)).toBe(false)
    }
  })

  it('creates no outgoing edges for objects with no deps', () => {
    expect(graph.outDegree(objectId('builtin', 'string'))).toBe(0)
    expect(graph.outDegree(objectId('builtin', 'number'))).toBe(0)
  })
})

describe('buildDependencyGraph from imports', () => {
  let workspace: Workspace
  let graph: DirectedGraph
  let signUpId: string
  let emailId: string
  let passwordId: string
  let stringId: string

  beforeAll(() => {
    workspace = new Workspace(loadSpexSpecsRecursive(importsDir))
    graph = buildDependencyGraph(workspace)
    signUpId = objectId(resolve(importsDir, 'main.spex'), 'SignUp')
    emailId = objectId(resolve(importsDir, 'types.spex'), 'EmailAddress')
    passwordId = objectId(resolve(importsDir, 'types.spex'), 'Password')
    stringId = objectId('builtin', 'string')
  })

  it('includes all objects from imported files as nodes', () => {
    expect(graph.hasNode(signUpId)).toBe(true)
    expect(graph.hasNode(emailId)).toBe(true)
    expect(graph.hasNode(passwordId)).toBe(true)
    expect(graph.order).toBe(workspace.objects.size)
  })

  it('creates edges for cross-file references', () => {
    expect(graph.hasEdge(signUpId, emailId)).toBe(true)
    expect(graph.hasEdge(signUpId, passwordId)).toBe(true)
  })

  it('creates edges to built-in types from imported files', () => {
    expect(graph.hasEdge(emailId, stringId)).toBe(true)
    expect(graph.hasEdge(passwordId, stringId)).toBe(true)
  })

  it('resolves names within file scope first', () => {
    expect(graph.hasEdge(signUpId, stringId)).toBe(true)
  })

  it('does not create self-loop edges for imports workspace', () => {
    for (const [id] of workspace.allObjects()) {
      expect(graph.hasEdge(id, id)).toBe(false)
    }
  })
})

describe('computeSCC', () => {
  let importsSCC: Map<string, number>
  let importsGraph: DirectedGraph

  beforeAll(() => {
    const workspace = new Workspace(loadSpexSpecsRecursive(importsDir))
    importsGraph = buildDependencyGraph(workspace)
    importsSCC = computeSCC(importsGraph)
  })

  it('maps every node to a component index', () => {
    const graph = new DirectedGraph()
    graph.addNode('a')
    graph.addNode('b')
    graph.addEdge('a', 'b')

    const scc = computeSCC(graph)
    expect(scc.size).toBe(2)
    expect(scc.has('a')).toBe(true)
    expect(scc.has('b')).toBe(true)
  })

  it('puts nodes in a cycle in the same component', () => {
    const graph = new DirectedGraph()
    graph.addNode('a')
    graph.addNode('b')
    graph.addEdge('a', 'b')
    graph.addEdge('b', 'a')

    const scc = computeSCC(graph)
    expect(scc.get('a')).toBe(scc.get('b'))
  })

  it('puts acyclic nodes in different components', () => {
    const graph = new DirectedGraph()
    graph.addNode('a')
    graph.addNode('b')
    graph.addEdge('a', 'b')

    const scc = computeSCC(graph)
    expect(scc.get('a')).not.toBe(scc.get('b'))
  })

  it('computes SCCs for the imports dependency graph', () => {
    expect(importsSCC.size).toBe(importsGraph.order)
    for (const id of importsGraph.nodes()) {
      expect(typeof importsSCC.get(id)).toBe('number')
    }
  })
})

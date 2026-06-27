import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { DirectedGraph } from 'graphology'
import { loadSpexSpecs, loadSpexSpecsRecursive } from '../src/parse/index.js'
import { Workspace, objectId, builtinId } from '../src/workspace/index.js'
import {
  buildDependencyGraphs,
  combineGraphs,
  computeSCC,
  condensationGraph,
  SCCResult,
} from '../src/workspace/graph.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const propsDir = resolve(__dirname, 'props')
const specsDir = resolve(propsDir, 'specs')
const importsDir = resolve(propsDir, 'imports')

describe('buildDependencyGraphs', () => {
  let workspace: Workspace
  let typeGraph: DirectedGraph
  let callGraph: DirectedGraph

  beforeAll(() => {
    workspace = new Workspace(loadSpexSpecs(specsDir))
    const graphs = buildDependencyGraphs(workspace)
    typeGraph = graphs.typeGraph
    callGraph = graphs.callGraph
  })

  it('includes all workspace objects as nodes in both graphs', () => {
    expect(typeGraph.order).toBe(workspace.objects.size)
    expect(callGraph.order).toBe(workspace.objects.size)
  })

  it('creates NamedObject edges in the type graph', () => {
    const addTodoId = objectId(resolve(specsDir, 'model.spex'), 'AddTodo')
    const todoId = objectId(resolve(specsDir, 'model.spex'), 'Todo')

    expect(typeGraph.hasEdge(addTodoId, todoId)).toBe(true)
  })

  it('does not put NamedObject refs in the call graph', () => {
    const addTodoId = objectId(resolve(specsDir, 'model.spex'), 'AddTodo')
    const todoId = objectId(resolve(specsDir, 'model.spex'), 'Todo')

    expect(callGraph.hasEdge(addTodoId, todoId)).toBe(false)
  })

  it('does not create self-loop edges in either graph', () => {
    for (const [id] of workspace.allObjects()) {
      expect(typeGraph.hasEdge(id, id)).toBe(false)
      expect(callGraph.hasEdge(id, id)).toBe(false)
    }
  })

  it('creates no outgoing edges for builtins in either graph', () => {
    expect(typeGraph.outDegree(builtinId('string'))).toBe(0)
    expect(typeGraph.outDegree(builtinId('number'))).toBe(0)
    expect(callGraph.outDegree(builtinId('string'))).toBe(0)
    expect(callGraph.outDegree(builtinId('number'))).toBe(0)
  })
})

describe('buildDependencyGraphs from imports', () => {
  let workspace: Workspace
  let typeGraph: DirectedGraph
  let callGraph: DirectedGraph
  let signUpId: string
  let emailId: string
  let passwordId: string
  let stringId: string

  beforeAll(() => {
    workspace = new Workspace(loadSpexSpecsRecursive(importsDir))
    const graphs = buildDependencyGraphs(workspace)
    typeGraph = graphs.typeGraph
    callGraph = graphs.callGraph
    signUpId = objectId(resolve(importsDir, 'main.spex'), 'SignUp')
    emailId = objectId(resolve(importsDir, 'types.spex'), 'EmailAddress')
    passwordId = objectId(resolve(importsDir, 'types.spex'), 'Password')
    stringId = builtinId('string')
  })

  it('includes all objects from imported files as nodes in both graphs', () => {
    expect(typeGraph.hasNode(signUpId)).toBe(true)
    expect(typeGraph.hasNode(emailId)).toBe(true)
    expect(typeGraph.hasNode(passwordId)).toBe(true)
    expect(typeGraph.order).toBe(workspace.objects.size)
    expect(callGraph.hasNode(signUpId)).toBe(true)
    expect(callGraph.hasNode(emailId)).toBe(true)
    expect(callGraph.hasNode(passwordId)).toBe(true)
    expect(callGraph.order).toBe(workspace.objects.size)
  })

  it('creates edges for cross-file type references in type graph', () => {
    expect(typeGraph.hasEdge(signUpId, emailId)).toBe(true)
    expect(typeGraph.hasEdge(signUpId, passwordId)).toBe(true)
  })

  it('does not put cross-file NamedObject refs in call graph', () => {
    expect(callGraph.hasEdge(signUpId, emailId)).toBe(false)
    expect(callGraph.hasEdge(signUpId, passwordId)).toBe(false)
  })

  it('creates edges to built-in types from imported files in type graph', () => {
    expect(typeGraph.hasEdge(emailId, stringId)).toBe(true)
    expect(typeGraph.hasEdge(passwordId, stringId)).toBe(true)
  })

  it('resolves names within file scope first in type graph', () => {
    expect(typeGraph.hasEdge(signUpId, stringId)).toBe(true)
  })

  it('does not create self-loop edges in either graph', () => {
    for (const [id] of workspace.allObjects()) {
      expect(typeGraph.hasEdge(id, id)).toBe(false)
      expect(callGraph.hasEdge(id, id)).toBe(false)
    }
  })
})

describe('buildDependencyGraphs @ref resolution', () => {
  it('throws on unresolved @reference', () => {
    const spec = {
      filePath: '/test/spec.spex',
      ast: {
        kind: 'SpexFile' as const,
        declarations: [
          {
            kind: 'ObjectDeclaration' as const,
            name: 'Foo',
            object: {
              kind: 'SubObject' as const,
              base: { kind: 'NamedObject' as const, name: 'string' },
              constraint: {
                raw: '',
                parts: [{ kind: 'ConstraintReference' as const, name: 'NonExistentRef' }],
              },
            },
          },
        ],
      },
    }

    const workspace = new Workspace([spec])
    expect(() => buildDependencyGraphs(workspace)).toThrow(
      'unresolved @reference "NonExistentRef" in "Foo"'
    )
  })

  it('does not throw on resolved @reference', () => {
    const spec = {
      filePath: '/test/spec.spex',
      ast: {
        kind: 'SpexFile' as const,
        declarations: [
          {
            kind: 'ObjectDeclaration' as const,
            name: 'Bar',
            object: {
              kind: 'SubObject' as const,
              base: { kind: 'NamedObject' as const, name: 'string' },
              constraint: {
                raw: '',
                parts: [{ kind: 'ConstraintText' as const, text: 'some constraint' }],
              },
            },
          },
          {
            kind: 'ObjectDeclaration' as const,
            name: 'Foo',
            object: {
              kind: 'SubObject' as const,
              base: { kind: 'NamedObject' as const, name: 'Bar' },
              constraint: {
                raw: '',
                parts: [{ kind: 'ConstraintReference' as const, name: 'Bar' }],
              },
            },
          },
        ],
      },
    }

    const workspace = new Workspace([spec])
    expect(() => buildDependencyGraphs(workspace)).not.toThrow()
  })

  it('does not throw on self-referencing @reference', () => {
    const spec = {
      filePath: '/test/spec.spex',
      ast: {
        kind: 'SpexFile' as const,
        declarations: [
          {
            kind: 'ObjectDeclaration' as const,
            name: 'SelfRef',
            object: {
              kind: 'SubObject' as const,
              base: { kind: 'NamedObject' as const, name: 'string' },
              constraint: {
                raw: '',
                parts: [{ kind: 'ConstraintReference' as const, name: 'SelfRef' }],
              },
            },
          },
        ],
      },
    }

    const workspace = new Workspace([spec])
    expect(() => buildDependencyGraphs(workspace)).not.toThrow()
  })
})

describe('computeSCC', () => {
  let importsSCC: SCCResult
  let importsGraph: DirectedGraph

  beforeAll(() => {
    const workspace = new Workspace(loadSpexSpecsRecursive(importsDir))
    const { typeGraph, callGraph } = buildDependencyGraphs(workspace)
    importsGraph = combineGraphs(typeGraph, callGraph)
    importsSCC = computeSCC(importsGraph)
  })

  it('maps every node to a component index', () => {
    const graph = new DirectedGraph()
    graph.addNode('a')
    graph.addNode('b')
    graph.addEdge('a', 'b')

    const scc = computeSCC(graph)
    expect(scc.nodeToComp.size).toBe(2)
    expect(scc.nodeToComp.has('a')).toBe(true)
    expect(scc.nodeToComp.has('b')).toBe(true)
  })

  it('puts nodes in a cycle in the same component', () => {
    const graph = new DirectedGraph()
    graph.addNode('a')
    graph.addNode('b')
    graph.addEdge('a', 'b')
    graph.addEdge('b', 'a')

    const scc = computeSCC(graph)
    expect(scc.getComp('a')).toBe(scc.getComp('b'))
  })

  it('puts acyclic nodes in different components', () => {
    const graph = new DirectedGraph()
    graph.addNode('a')
    graph.addNode('b')
    graph.addEdge('a', 'b')

    const scc = computeSCC(graph)
    expect(scc.getComp('a')).not.toBe(scc.getComp('b'))
  })

  it('computes SCCs for the imports dependency graph', () => {
    expect(importsSCC.nodeToComp.size).toBe(importsGraph.order)
    for (const id of importsGraph.nodes()) {
      expect(typeof importsSCC.getComp(id)).toBe('number')
    }
  })
})

describe('condensationGraph', () => {
  let importsCG: DirectedGraph

  beforeAll(() => {
    const workspace = new Workspace(loadSpexSpecsRecursive(importsDir))
    const { typeGraph, callGraph } = buildDependencyGraphs(workspace)
    const graph = combineGraphs(typeGraph, callGraph)
    const scc = computeSCC(graph)
    importsCG = condensationGraph(graph, scc)
  })

  it('has one node per SCC component', () => {
    const graph = new DirectedGraph()
    graph.addNode('a')
    graph.addNode('b')
    graph.addNode('c')
    graph.addEdge('a', 'b')
    graph.addEdge('b', 'a')
    graph.addEdge('b', 'c')

    const scc = computeSCC(graph)
    const cg = condensationGraph(graph, scc)
    expect(cg.order).toBe(2)
  })

  it('is acyclic', () => {
    const graph = new DirectedGraph()
    graph.addNode('a')
    graph.addNode('b')
    graph.addNode('c')
    graph.addEdge('a', 'b')
    graph.addEdge('b', 'c')
    graph.addEdge('c', 'a')

    const scc = computeSCC(graph)
    const cg = condensationGraph(graph, scc)
    // All nodes in one cycle => single SCC node, no edges
    expect(cg.order).toBe(1)
    expect(cg.size).toBe(0)
  })

  it('preserves edges between different components', () => {
    const graph = new DirectedGraph()
    graph.addNode('a')
    graph.addNode('b')
    graph.addNode('c')
    graph.addEdge('a', 'b')
    graph.addEdge('b', 'c')

    const scc = computeSCC(graph)
    const cg = condensationGraph(graph, scc)
    // a->b->c, all acyclic => 3 nodes, 2 edges
    expect(cg.order).toBe(3)
    expect(cg.size).toBe(2)
  })

  it('builds condensation of the imports dependency graph', () => {
    expect(importsCG.order).toBeGreaterThan(0)
    // every SCC has no self-loops by construction
    for (const node of importsCG.nodes()) {
      expect(importsCG.hasEdge(node, node)).toBe(false)
    }
  })
})

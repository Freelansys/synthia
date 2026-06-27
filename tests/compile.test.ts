import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DirectedGraph } from 'graphology'
import { loadSpexSpecs } from '../src/parse/index.js'
import { Workspace, objectId } from '../src/workspace/index.js'
import {
  buildDependencyGraphs,
  combineGraphs,
  computeSCC,
  condensationGraph,
  SCCResult,
} from '../src/workspace/graph.js'
import {
  extractSubgraph,
  topologicalSort,
  compileEntryPoint,
  isAbstract,
  type CompileConfig,
} from '../src/generate/compile.js'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const propsDir = resolve(__dirname, 'props')
const specsDir = resolve(propsDir, 'specs')

describe('extractSubgraph', () => {
  it('includes the root component', () => {
    const cg = new DirectedGraph({ allowSelfLoops: false })
    cg.addNode('0')
    cg.addNode('1')
    cg.addEdge('0', '1')

    const sub = extractSubgraph(cg, 0)
    expect(sub.hasNode('0')).toBe(true)
  })

  it('includes transitive dependencies', () => {
    const cg = new DirectedGraph({ allowSelfLoops: false })
    cg.addNode('0')
    cg.addNode('1')
    cg.addNode('2')
    cg.addEdge('0', '1')
    cg.addEdge('1', '2')

    const sub = extractSubgraph(cg, 0)
    expect(sub.hasNode('0')).toBe(true)
    expect(sub.hasNode('1')).toBe(true)
    expect(sub.hasNode('2')).toBe(true)
    expect(sub.order).toBe(3)
  })

  it('excludes unrelated components', () => {
    const cg = new DirectedGraph({ allowSelfLoops: false })
    cg.addNode('0')
    cg.addNode('1')
    cg.addNode('2')
    cg.addEdge('0', '1')

    const sub = extractSubgraph(cg, 0)
    expect(sub.hasNode('1')).toBe(true)
    expect(sub.hasNode('2')).toBe(false)
  })

  it('preserves edges between reachable components', () => {
    const cg = new DirectedGraph({ allowSelfLoops: false })
    cg.addNode('0')
    cg.addNode('1')
    cg.addNode('2')
    cg.addEdge('0', '1')
    cg.addEdge('0', '2')

    const sub = extractSubgraph(cg, 0)
    expect(sub.hasEdge('0', '1')).toBe(true)
    expect(sub.hasEdge('0', '2')).toBe(true)
    expect(sub.size).toBe(2)
  })
})

describe('topologicalSort', () => {
  it('returns sinks first', () => {
    const graph = new DirectedGraph({ allowSelfLoops: false })
    graph.addNode('0')
    graph.addNode('1')
    graph.addNode('2')
    graph.addEdge('0', '1')
    graph.addEdge('1', '2')

    const order = topologicalSort(graph)
    expect(order.indexOf('2')).toBeLessThan(order.indexOf('1'))
    expect(order.indexOf('1')).toBeLessThan(order.indexOf('0'))
  })

  it('includes all nodes', () => {
    const graph = new DirectedGraph({ allowSelfLoops: false })
    graph.addNode('a')
    graph.addNode('b')
    graph.addEdge('a', 'b')

    const order = topologicalSort(graph)
    expect(order).toHaveLength(2)
    expect(order).toContain('a')
    expect(order).toContain('b')
  })

  it('handles a single node', () => {
    const graph = new DirectedGraph({ allowSelfLoops: false })
    graph.addNode('only')

    const order = topologicalSort(graph)
    expect(order).toEqual(['only'])
  })

  it('handles disconnected components', () => {
    const graph = new DirectedGraph({ allowSelfLoops: false })
    graph.addNode('a')
    graph.addNode('b')
    graph.addNode('c')
    graph.addEdge('a', 'b')

    const order = topologicalSort(graph)
    expect(order).toHaveLength(3)
    expect(order.indexOf('a')).toBeGreaterThan(order.indexOf('b'))
  })
})

describe('compileEntryPoint', () => {
  let workspace: Workspace
  let typeGraph: DirectedGraph
  let callGraph: DirectedGraph
  let scc: SCCResult
  let cg: DirectedGraph
  let cacheDir: string
  let outDir: string

  const compileConfig: CompileConfig = { targetLanguage: 'typescript' }

  beforeAll(() => {
    workspace = new Workspace(loadSpexSpecs(specsDir))
    const graphs = buildDependencyGraphs(workspace)
    typeGraph = graphs.typeGraph
    callGraph = graphs.callGraph
    const depGraph = combineGraphs(typeGraph, callGraph)
    scc = computeSCC(depGraph)
    cg = condensationGraph(depGraph, scc)
    cacheDir = mkdtempSync(join(tmpdir(), 'synthia-compile-'))
    outDir = mkdtempSync(join(tmpdir(), 'synthia-out-'))
  })

  afterAll(() => {
    rmSync(cacheDir, { recursive: true, force: true })
    rmSync(outDir, { recursive: true, force: true })
  })

  it('returns artifacts and output files for each object in the subgraph', async () => {
    const entryPoint = workspace.entryPoints.find((ep) => ep.declaration.name === 'Todo')
    expect(entryPoint).toBeDefined()

    const result = await compileEntryPoint(
      workspace,
      callGraph,
      typeGraph,
      scc,
      cg,
      entryPoint!,
      cacheDir,
      outDir,
      compileConfig
    )
    expect(result.artifacts.length).toBeGreaterThan(0)

    for (const artifact of result.artifacts) {
      expect(existsSync(artifact)).toBe(true)
      const content = JSON.parse(readFileSync(artifact, 'utf-8'))
      expect(content).toHaveProperty('objectId')
      expect(content).toHaveProperty('declaration')
    }

    for (const file of result.outputFiles) {
      expect(existsSync(file)).toBe(true)
    }
  })

  it('reuses cached artifacts on second call via existsSync', async () => {
    const entryPoint = workspace.entryPoints.find((ep) => ep.declaration.name === 'Todo')!

    const first = await compileEntryPoint(
      workspace,
      callGraph,
      typeGraph,
      scc,
      cg,
      entryPoint,
      cacheDir,
      outDir,
      compileConfig
    )
    const second = await compileEntryPoint(
      workspace,
      callGraph,
      typeGraph,
      scc,
      cg,
      entryPoint,
      cacheDir,
      outDir,
      compileConfig
    )

    expect(second.artifacts).toEqual(first.artifacts)
  })

  it('regenerates artifact when file is deleted from disk', async () => {
    const entryPoint = workspace.entryPoints.find((ep) => ep.declaration.name === 'Todo')!

    const first = await compileEntryPoint(
      workspace,
      callGraph,
      typeGraph,
      scc,
      cg,
      entryPoint,
      cacheDir,
      outDir,
      compileConfig
    )

    const deleted = first.artifacts[0]
    rmSync(deleted)

    const second = await compileEntryPoint(
      workspace,
      callGraph,
      typeGraph,
      scc,
      cg,
      entryPoint,
      cacheDir,
      outDir,
      compileConfig
    )
    expect(second.artifacts).toEqual(first.artifacts)
    expect(existsSync(deleted)).toBe(true)
  })

  it('returns empty artifacts and outputFiles for unknown entry point name', async () => {
    const fakeEntry = {
      filePath: resolve(specsDir, 'entry.spex'),
      declaration: { kind: 'GenerateDeclaration' as const, name: 'NonExistent' },
    }

    const result = await compileEntryPoint(
      workspace,
      callGraph,
      typeGraph,
      scc,
      cg,
      fakeEntry,
      cacheDir,
      outDir,
      compileConfig
    )
    expect(result.artifacts).toHaveLength(0)
    expect(result.outputFiles).toHaveLength(0)
  })
})

describe('isAbstract', () => {
  it('returns true for SubObject with no callGraph edges', () => {
    const workspace = new Workspace([
      {
        filePath: '/test.spex',
        ast: {
          kind: 'SpexFile' as const,
          declarations: [
            {
              kind: 'ObjectDeclaration' as const,
              name: 'Vague',
              object: {
                kind: 'SubObject' as const,
                base: { kind: 'NamedObject' as const, name: 'string' },
                constraint: {
                  raw: '',
                  parts: [{ kind: 'ConstraintText' as const, text: 'is valid' }],
                },
              },
            },
          ],
        },
      },
    ])
    const { callGraph } = buildDependencyGraphs(workspace)
    const id = objectId('/test.spex', 'Vague')
    expect(isAbstract(id, workspace, callGraph)).toBe(true)
  })

  it('returns false for SubObject with outgoing callGraph edge', () => {
    const workspace = new Workspace([
      {
        filePath: '/test.spex',
        ast: {
          kind: 'SpexFile' as const,
          declarations: [
            {
              kind: 'ObjectDeclaration' as const,
              name: 'Check',
              object: {
                kind: 'SubObject' as const,
                base: { kind: 'NamedObject' as const, name: 'string' },
                constraint: {
                  raw: '',
                  parts: [{ kind: 'ConstraintText' as const, text: 'checks' }],
                },
              },
            },
            {
              kind: 'ObjectDeclaration' as const,
              name: 'Caller',
              object: {
                kind: 'SubObject' as const,
                base: { kind: 'NamedObject' as const, name: 'string' },
                constraint: {
                  raw: '',
                  parts: [{ kind: 'ConstraintReference' as const, name: 'Check' }],
                },
              },
            },
          ],
        },
      },
    ])
    const { callGraph } = buildDependencyGraphs(workspace)
    const callerId = objectId('/test.spex', 'Caller')
    expect(isAbstract(callerId, workspace, callGraph)).toBe(false)
  })

  it('returns false for SubObject with incoming callGraph edge', () => {
    const workspace = new Workspace([
      {
        filePath: '/test.spex',
        ast: {
          kind: 'SpexFile' as const,
          declarations: [
            {
              kind: 'ObjectDeclaration' as const,
              name: 'Check',
              object: {
                kind: 'SubObject' as const,
                base: { kind: 'NamedObject' as const, name: 'string' },
                constraint: {
                  raw: '',
                  parts: [{ kind: 'ConstraintText' as const, text: 'checks' }],
                },
              },
            },
            {
              kind: 'ObjectDeclaration' as const,
              name: 'Caller',
              object: {
                kind: 'SubObject' as const,
                base: { kind: 'NamedObject' as const, name: 'string' },
                constraint: {
                  raw: '',
                  parts: [{ kind: 'ConstraintReference' as const, name: 'Check' }],
                },
              },
            },
          ],
        },
      },
    ])
    const { callGraph } = buildDependencyGraphs(workspace)
    const checkId = objectId('/test.spex', 'Check')
    expect(isAbstract(checkId, workspace, callGraph)).toBe(false)
  })

  it('returns false for ProductObject with no callGraph edges', () => {
    const workspace = new Workspace([
      {
        filePath: '/test.spex',
        ast: {
          kind: 'SpexFile' as const,
          declarations: [
            {
              kind: 'ObjectDeclaration' as const,
              name: 'Data',
              object: {
                kind: 'ProductObject' as const,
                fields: { value: { kind: 'NamedObject' as const, name: 'string' } },
              },
            },
          ],
        },
      },
    ])
    const { callGraph } = buildDependencyGraphs(workspace)
    const id = objectId('/test.spex', 'Data')
    expect(isAbstract(id, workspace, callGraph)).toBe(false)
  })

  it('returns false for non-existent id', () => {
    const workspace = new Workspace([])
    const callGraph = new DirectedGraph({ allowSelfLoops: false })
    expect(isAbstract('file://nonexistent', workspace, callGraph)).toBe(false)
  })
})

describe('compileEntryPoint with abstract objects', () => {
  let cacheDir: string
  let outDir: string

  const compileConfig: CompileConfig = { targetLanguage: 'typescript' }

  beforeAll(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'synthia-abstract-'))
    outDir = mkdtempSync(join(tmpdir(), 'synthia-abstract-out-'))
  })

  afterAll(() => {
    rmSync(cacheDir, { recursive: true, force: true })
    rmSync(outDir, { recursive: true, force: true })
  })

  it('skips abstract subobjects and only generates concrete ones', async () => {
    const spec = {
      filePath: '/test/abstract.spex',
      ast: {
        kind: 'SpexFile' as const,
        declarations: [
          {
            kind: 'ObjectDeclaration' as const,
            name: 'Base',
            object: {
              kind: 'ProductObject' as const,
              fields: { value: { kind: 'NamedObject' as const, name: 'string' } },
            },
          },
          {
            kind: 'ObjectDeclaration' as const,
            name: 'Vague',
            object: {
              kind: 'SubObject' as const,
              base: { kind: 'NamedObject' as const, name: 'Base' },
              constraint: {
                raw: '',
                parts: [{ kind: 'ConstraintText' as const, text: 'is valid' }],
              },
            },
          },
          {
            kind: 'ObjectDeclaration' as const,
            name: 'Checker',
            object: {
              kind: 'SubObject' as const,
              base: {
                kind: 'ExponentialObject' as const,
                base: { kind: 'NamedObject' as const, name: 'Base' },
                exponent: { kind: 'NamedObject' as const, name: 'bool' },
              },
              constraint: {
                raw: '',
                parts: [{ kind: 'ConstraintText' as const, text: 'checks validity' }],
              },
            },
          },
          {
            kind: 'ObjectDeclaration' as const,
            name: 'Concrete',
            object: {
              kind: 'SubObject' as const,
              base: { kind: 'NamedObject' as const, name: 'Base' },
              constraint: {
                raw: '',
                parts: [{ kind: 'ConstraintReference' as const, name: 'Checker' }],
              },
            },
          },
          {
            kind: 'GenerateDeclaration' as const,
            name: 'Concrete',
          },
        ],
      },
    }

    const workspace = new Workspace([spec])
    const { typeGraph, callGraph } = buildDependencyGraphs(workspace)
    const depGraph = combineGraphs(typeGraph, callGraph)
    const scc = computeSCC(depGraph)
    const cg = condensationGraph(depGraph, scc)
    const entryPoint = workspace.entryPoints.find((ep) => ep.declaration.name === 'Concrete')!

    const result = await compileEntryPoint(
      workspace,
      callGraph,
      typeGraph,
      scc,
      cg,
      entryPoint,
      cacheDir,
      outDir,
      compileConfig
    )

    const baseId = objectId('/test/abstract.spex', 'Base')
    const vagueId = objectId('/test/abstract.spex', 'Vague')
    const checkerId = objectId('/test/abstract.spex', 'Checker')
    const concreteId = objectId('/test/abstract.spex', 'Concrete')

    expect(isAbstract(vagueId, workspace, callGraph)).toBe(true)
    expect(isAbstract(baseId, workspace, callGraph)).toBe(false)
    expect(isAbstract(concreteId, workspace, callGraph)).toBe(false)
    expect(isAbstract(checkerId, workspace, callGraph)).toBe(false)

    expect(result.artifacts.length).toBeGreaterThan(0)
    for (const artifact of result.artifacts) {
      const content = JSON.parse(readFileSync(artifact, 'utf-8'))
      const objId: string = content.objectId
      expect(objId).not.toBe(vagueId)
    }

    expect(result.outputFiles.length).toBeGreaterThan(0)
  })

  it('compiles all objects in a dependency chain', async () => {
    const spec = {
      filePath: '/test/chain.spex',
      ast: {
        kind: 'SpexFile' as const,
        declarations: [
          {
            kind: 'ObjectDeclaration' as const,
            name: 'C',
            object: {
              kind: 'ProductObject' as const,
              fields: { value: { kind: 'NamedObject' as const, name: 'string' } },
            },
          },
          {
            kind: 'ObjectDeclaration' as const,
            name: 'B',
            object: {
              kind: 'ProductObject' as const,
              fields: { child: { kind: 'NamedObject' as const, name: 'C' } },
            },
          },
          {
            kind: 'ObjectDeclaration' as const,
            name: 'A',
            object: {
              kind: 'ProductObject' as const,
              fields: { child: { kind: 'NamedObject' as const, name: 'B' } },
            },
          },
          {
            kind: 'GenerateDeclaration' as const,
            name: 'A',
          },
        ],
      },
    } as any

    const workspace = new Workspace([spec])
    const { typeGraph, callGraph } = buildDependencyGraphs(workspace)
    const depGraph = combineGraphs(typeGraph, callGraph)
    const scc = computeSCC(depGraph)
    const cg = condensationGraph(depGraph, scc)
    const entryPoint = workspace.entryPoints.find((ep) => ep.declaration.name === 'A')!

    const result = await compileEntryPoint(
      workspace,
      callGraph,
      typeGraph,
      scc,
      cg,
      entryPoint,
      cacheDir,
      outDir,
      compileConfig
    )

    expect(result.artifacts).toHaveLength(3)

    const artifactIds = result.artifacts.map((a) => {
      const content = JSON.parse(readFileSync(a, 'utf-8'))
      return content.objectId
    })
    expect(artifactIds).toContain(objectId('/test/chain.spex', 'A'))
    expect(artifactIds).toContain(objectId('/test/chain.spex', 'B'))
    expect(artifactIds).toContain(objectId('/test/chain.spex', 'C'))

    expect(result.outputFiles.length).toBeGreaterThan(0)
  })
})

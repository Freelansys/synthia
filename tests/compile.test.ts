import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DirectedGraph } from 'graphology'
import { loadSpexSpecs } from '../src/parse/index.js'
import { Workspace } from '../src/workspace/index.js'
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

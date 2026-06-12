import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DirectedGraph } from 'graphology'
import { loadSpexSpecs } from '../src/parse/index.js'
import { Workspace } from '../src/workspace/index.js'
import { buildDependencyGraph, computeSCC, condensationGraph, SCCResult } from '../src/workspace/graph.js'
import { type ArtifactCache } from '../src/workspace/index.js'
import { extractSubgraph, topologicalSort, compileEntryPoint } from '../src/generate/compile.js'
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
  let scc: SCCResult
  let cg: DirectedGraph
  let cacheDir: string

  beforeAll(() => {
    workspace = new Workspace(loadSpexSpecs(specsDir))
    const graph = buildDependencyGraph(workspace)
    scc = computeSCC(graph)
    cg = condensationGraph(graph, scc)
    cacheDir = mkdtempSync(join(tmpdir(), 'synthia-compile-'))
  })

  afterAll(() => {
    rmSync(cacheDir, { recursive: true, force: true })
  })

  it('returns artifacts for each object in the subgraph', () => {
    workspace.artifactCache.clear()
    const entryPoint = workspace.entryPoints.find((ep) => ep.declaration.name === 'Todo')
    expect(entryPoint).toBeDefined()

    const artifacts = compileEntryPoint(workspace, scc, cg, entryPoint!, cacheDir)
    expect(artifacts.length).toBeGreaterThan(0)

    for (const artifact of artifacts) {
      expect(existsSync(artifact)).toBe(true)
      const content = JSON.parse(readFileSync(artifact, 'utf-8'))
      expect(content).toHaveProperty('objectId')
      expect(content).toHaveProperty('declaration')
    }
  })

  it('populates the cache with objectId-to-artifact mappings', () => {
    workspace.artifactCache.clear()
    const entryPoint = workspace.entryPoints.find((ep) => ep.declaration.name === 'Todo')!

    const artifacts = compileEntryPoint(workspace, scc, cg, entryPoint, cacheDir)
    const cache: ArtifactCache = workspace.artifactCache

    expect(cache.size).toBeGreaterThan(0)
    for (const artifact of artifacts) {
      const content = JSON.parse(readFileSync(artifact, 'utf-8'))
      expect(cache.get(content.objectId)).toBe(artifact)
    }
  })

  it('reuses cached artifacts on second call', () => {
    workspace.artifactCache.clear()
    const entryPoint = workspace.entryPoints.find((ep) => ep.declaration.name === 'Todo')!

    const first = compileEntryPoint(workspace, scc, cg, entryPoint, cacheDir)
    const second = compileEntryPoint(workspace, scc, cg, entryPoint, cacheDir)

    expect(second).toEqual(first)
    expect(workspace.artifactCache.size).toBe(first.length)
  })

  it('returns empty array for unknown entry point name', () => {
    workspace.artifactCache.clear()
    const fakeEntry = {
      filePath: resolve(specsDir, 'entry.spex'),
      declaration: { kind: 'GenerateDeclaration' as const, name: 'NonExistent' },
    }

    const artifacts = compileEntryPoint(workspace, scc, cg, fakeEntry, cacheDir)
    expect(artifacts).toHaveLength(0)
  })
})

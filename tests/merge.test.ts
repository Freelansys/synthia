import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DirectedGraph } from 'graphology'
import { topologicalSort as dagTopologicalSort } from 'graphology-dag'
import { type ObjectDeclaration, type ObjectExpression, type SpexFile } from 'spex-parser'
import { Workspace, BUILTIN_NAMESPACE } from '../src/workspace/index.js'
import {
  buildDependencyGraph,
  computeSCC,
  condensationGraph,
  type SCCResult,
} from '../src/workspace/graph.js'
import { extractSubgraph, topologicalSort } from '../src/generate/compile.js'
import {
  mergeGeneratedCode,
  collectBuiltinFiltered,
  sortedObjectNames,
  resolveImports,
  type MergerParams,
} from '../src/generate/merge/index.js'
import { typescriptMerge } from '../src/generate/merge/typescript.js'
import { pythonMerge } from '../src/generate/merge/python.js'

// ── Helpers ────────────────────────────────────────────────

function makeSpec(name: string, object: Record<string, string>): ObjectDeclaration {
  const fields: Record<string, ObjectExpression> = {}
  for (const [key, typeName] of Object.entries(object)) {
    fields[key] = { kind: 'NamedObject', name: typeName } as ObjectExpression
  }
  return {
    kind: 'ObjectDeclaration',
    name,
    object: { kind: 'ProductObject', fields },
  }
}

function makeSpecFile(
  path: string,
  specs: ObjectDeclaration[]
): { filePath: string; ast: SpexFile } {
  return {
    filePath: path,
    ast: { kind: 'SpexFile', declarations: [...specs] },
  }
}
function entryPoint(name: string, filePath: string) {
  return { declaration: { kind: 'GenerateDeclaration' as const, name }, filePath }
}

// ── Tests ──────────────────────────────────────────────────

describe('collectBuiltinFiltered', () => {
  it('filters out built-in IDs', () => {
    const graph = new DirectedGraph({ allowSelfLoops: false })
    graph.addNode(`file://${BUILTIN_NAMESPACE}::string`)
    graph.addNode('file://spec.spex::User')
    graph.addNode(`file://${BUILTIN_NAMESPACE}::number`)
    const scc = computeSCC(graph)

    const comp0 = scc.getComp('file://spec.spex::User')
    expect(comp0).toBeDefined()
    const ids = collectBuiltinFiltered(scc, comp0!)
    expect(ids).toEqual(['file://spec.spex::User'])
  })

  it('returns empty when all IDs are builtins', () => {
    const graph = new DirectedGraph({ allowSelfLoops: false })
    graph.addNode(`file://${BUILTIN_NAMESPACE}::string`)
    graph.addNode(`file://${BUILTIN_NAMESPACE}::bool`)
    const scc = computeSCC(graph)

    const comp = scc.getComp(`file://${BUILTIN_NAMESPACE}::string`)!
    expect(collectBuiltinFiltered(scc, comp)).toHaveLength(0)
  })
})

describe('sortedObjectNames', () => {
  it('returns sorted names from workspace by ID order', () => {
    const ws = new Workspace([
      makeSpecFile('/spec/a.spex', [
        makeSpec('Zebra', {}),
        makeSpec('Alpha', {}),
        makeSpec('Beta', {}),
      ]),
    ])
    const ids = [
      'file:///spec/a.spex::Zebra',
      'file:///spec/a.spex::Alpha',
      'file:///spec/a.spex::Beta',
    ]
    expect(sortedObjectNames(ws, ids)).toEqual(['Alpha', 'Beta', 'Zebra'])
  })

  it('falls back to Unknown for missing objects', () => {
    const ws = new Workspace([])
    expect(sortedObjectNames(ws, ['file://nonexistent'])).toEqual(['Unknown'])
  })
})

describe('resolveImports', () => {
  let ws: Workspace
  let depGraph: DirectedGraph
  let scc: SCCResult
  let cg: DirectedGraph

  beforeAll(() => {
    ws = new Workspace([
      makeSpecFile('/spec/app.spex', [
        makeSpec('C', { val: 'string' }),
        makeSpec('B', { child: 'C' }),
        makeSpec('A', { child: 'B' }),
      ]),
    ])
    depGraph = buildDependencyGraph(ws)
    scc = computeSCC(depGraph)
    cg = condensationGraph(depGraph, scc)
  })

  it('resolves imports between different SCCs', () => {
    const aId = 'file:///spec/app.spex::A'
    const bId = 'file:///spec/app.spex::B'
    const cId = 'file:///spec/app.spex::C'

    const compA = scc.getComp(aId)!
    const compB = scc.getComp(bId)!
    const compC = scc.getComp(cId)!

    const compToBaseName = new Map<number, string>()
    compToBaseName.set(compB, 'B')
    compToBaseName.set(compC, 'C')

    const imports = resolveImports(ws, depGraph, scc, [aId], compA, compToBaseName, '/out', '/out')

    expect(imports.has('./B')).toBe(true)
    expect(imports.get('./B')).toEqual(new Set(['B']))
    expect(imports.has('./C')).toBe(false) // transitive deps are NOT included
  })

  it('does not include self-imports', () => {
    const bId = 'file:///spec/app.spex::B'
    const comp = scc.getComp(bId)!

    const compToBaseName = new Map<number, string>()
    compToBaseName.set(comp, 'B')

    const imports = resolveImports(ws, depGraph, scc, [bId], comp, compToBaseName, '/out', '/out')
    expect(imports.size).toBe(0)
  })

  it('skips built-in dependencies', () => {
    const builtinId = `file://${BUILTIN_NAMESPACE}::string`
    const graph = new DirectedGraph({ allowSelfLoops: false })
    graph.addNode(builtinId)
    graph.addNode('file://spec.spex::Foo')
    graph.addEdge('file://spec.spex::Foo', builtinId)
    const localScc = computeSCC(graph)

    const compFoo = localScc.getComp('file://spec.spex::Foo')!
    const compToBaseName = new Map()

    const imports = resolveImports(
      new Workspace([]),
      graph,
      localScc,
      ['file://spec.spex::Foo'],
      compFoo,
      compToBaseName,
      '/out',
      '/out'
    )
    expect(imports.size).toBe(0)
  })
})

describe('mergeGeneratedCode dispatcher', () => {
  it('throws for unknown language', () => {
    expect(() =>
      mergeGeneratedCode(
        new Workspace([]),
        new DirectedGraph({ allowSelfLoops: false }),
        computeSCC(new DirectedGraph({ allowSelfLoops: false })),
        [],
        new Map(),
        '/tmp',
        'brainfuck'
      )
    ).toThrow('unsupported target language for merge: brainfuck')
  })
})

// ── End-to-end merge tests ─────────────────────────────────

function setupMergeScenario(entryName = 'A'): {
  workspace: Workspace
  depGraph: DirectedGraph
  scc: SCCResult
  order: string[]
  generatedCodeMap: Map<string, string>
  outputDir: string
} {
  const decls: ObjectDeclaration[] = [
    makeSpec('C', { val: 'string' }),
    makeSpec('B', { child: 'C' }),
    makeSpec('A', { child: 'B' }),
  ]

  if (entryName === 'X') {
    decls.push(makeSpec('X', { child: 'Y' }), makeSpec('Y', { child: 'X', inner: 'C' }))
  }

  const ws = new Workspace([makeSpecFile('/spec/test.spex', decls)])
  const dg = buildDependencyGraph(ws)
  const sc = computeSCC(dg)
  const cg = condensationGraph(dg, sc)

  const entry = entryPoint(entryName, '/spec/test.spex')
  const entryId = ws.resolveName(entry.declaration.name, entry.filePath)!
  const rootComp = sc.getComp(entryId)!
  const subgraph = extractSubgraph(cg, rootComp)
  const order = topologicalSort(subgraph)

  const generatedCodeMap = new Map<string, string>()
  for (const [id, decl] of ws.allObjects()) {
    if (id.startsWith(`file://${BUILTIN_NAMESPACE}::`)) continue
    generatedCodeMap.set(id, `export interface ${decl.name} {\n  /* generated */\n}`)
  }

  const outDir = mkdtempSync(resolve(tmpdir(), 'synthia-merge-'))

  return { workspace: ws, depGraph: dg, scc: sc, order, generatedCodeMap, outputDir: outDir }
}

describe('typescriptMerge', () => {
  let scenario: ReturnType<typeof setupMergeScenario>

  beforeAll(() => {
    scenario = setupMergeScenario()
  })

  afterAll(() => {
    rmSync(scenario.outputDir, { recursive: true, force: true })
  })

  it('writes a .ts file for each single-object SCC', () => {
    const files = typescriptMerge(scenario as MergerParams)
    expect(files).toHaveLength(3) // C, B, A
    expect(files.some((f) => f.endsWith('/C.ts'))).toBe(true)
    expect(files.some((f) => f.endsWith('/B.ts'))).toBe(true)
    expect(files.some((f) => f.endsWith('/A.ts'))).toBe(true)
  })

  it('generates correct import in dependent SCC', () => {
    const files = typescriptMerge(scenario as MergerParams)
    const aFile = files.find((f) => f.endsWith('/A.ts'))!
    const content = readFileSync(aFile, 'utf-8')

    expect(content).toContain("import { B } from './B'")
    expect(content).toContain('export interface A {')
  })

  it('generates no imports for leaf SCC', () => {
    const files = typescriptMerge(scenario as MergerParams)
    const cFile = files.find((f) => f.endsWith('/C.ts'))!
    const content = readFileSync(cFile, 'utf-8')

    expect(content).not.toContain('import')
    expect(content).toContain('export interface C {')
  })

  it('prepends auto-generated header', () => {
    const files = typescriptMerge(scenario as MergerParams)
    const content = readFileSync(files[0], 'utf-8')
    expect(content.startsWith('// Auto-generated by Synthia')).toBe(true)
  })

  it('writes TODO stubs for missing generated code', () => {
    const { workspace, depGraph, scc, outputDir } = scenario
    const order = scenario.order

    const emptyMap = new Map<string, string>()
    const files = typescriptMerge({
      workspace,
      depGraph,
      scc,
      order,
      generatedCodeMap: emptyMap,
      outputDir,
    })

    const content = readFileSync(files[0], 'utf-8')
    expect(content).toContain('// TODO: generate')
  })
})

describe('typescriptMerge with multi-object SCC', () => {
  let scenario: ReturnType<typeof setupMergeScenario>

  beforeAll(() => {
    scenario = setupMergeScenario('X')
  })

  afterAll(() => {
    rmSync(scenario.outputDir, { recursive: true, force: true })
  })

  it('writes index.ts for multi-object SCC', () => {
    const files = typescriptMerge(scenario as MergerParams)
    const dirEntry = files.find((f) => f.endsWith('/XAndY/index.ts'))
    expect(dirEntry).toBeDefined()
  })

  it('includes both objects in the multi-object file', () => {
    const files = typescriptMerge(scenario as MergerParams)
    const dirEntry = files.find((f) => f.endsWith('/XAndY/index.ts'))!
    const content = readFileSync(dirEntry, 'utf-8')
    expect(content).toContain('export interface X {')
    expect(content).toContain('export interface Y {')
  })
})

describe('pythonMerge', () => {
  let scenario: ReturnType<typeof setupMergeScenario>

  beforeAll(() => {
    scenario = setupMergeScenario()
  })

  afterAll(() => {
    rmSync(scenario.outputDir, { recursive: true, force: true })
  })

  it('writes a .py file for each single-object SCC', () => {
    const files = pythonMerge(scenario as MergerParams)
    expect(files).toHaveLength(3)
    expect(files.some((f) => f.endsWith('/C.py'))).toBe(true)
    expect(files.some((f) => f.endsWith('/B.py'))).toBe(true)
    expect(files.some((f) => f.endsWith('/A.py'))).toBe(true)
  })

  it('generates Python-style imports', () => {
    const files = pythonMerge(scenario as MergerParams)
    const aFile = files.find((f) => f.endsWith('/A.py'))!
    const content = readFileSync(aFile, 'utf-8')

    expect(content).toContain('from .B import B')
    expect(content).toContain('export interface A')
  })

  it('writes TODO stubs with Python comment syntax', () => {
    const { workspace, depGraph, scc, outputDir } = scenario
    const emptyMap = new Map<string, string>()
    const files = pythonMerge({
      workspace,
      depGraph,
      scc,
      order: scenario.order,
      generatedCodeMap: emptyMap,
      outputDir,
    })

    const content = readFileSync(files[0], 'utf-8')
    expect(content).toContain('# TODO: generate')
  })

  it('writes __init__.py for multi-object SCC', () => {
    const multiScenario = setupMergeScenario('X')
    const files = pythonMerge(multiScenario as MergerParams)
    const dirEntry = files.find((f) => f.endsWith('/XAndY/__init__.py'))
    expect(dirEntry).toBeDefined()
    rmSync(multiScenario.outputDir, { recursive: true, force: true })
  })
})

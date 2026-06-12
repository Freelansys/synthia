import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSpexSpecs } from '../src/parse/index.js'
import { Workspace, objectId } from '../src/workspace/index.js'
import { buildDependencyGraph } from '../src/workspace/graph.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const propsDir = resolve(__dirname, 'props')
const specsDir = resolve(propsDir, 'specs')

describe('buildDependencyGraph', () => {
  it('includes all workspace objects as nodes', async () => {
    const workspace = new Workspace(loadSpexSpecs(specsDir))
    const graph = buildDependencyGraph(workspace)

    expect(graph.order).toBe(workspace.objects.size)
  })

  it('creates edges for NamedObject references', async () => {
    const workspace = new Workspace(loadSpexSpecs(specsDir))
    const graph = buildDependencyGraph(workspace)

    // AddTodo references Todo so there should be an edge
    const addTodoId = objectId(resolve(specsDir, 'model.spex'), 'AddTodo')
    const todoId = objectId(resolve(specsDir, 'model.spex'), 'Todo')

    expect(graph.hasEdge(addTodoId, todoId)).toBe(true)
  })

  it('does not create self-loop edges', async () => {
    const workspace = new Workspace(loadSpexSpecs(specsDir))
    const graph = buildDependencyGraph(workspace)

    for (const [id] of workspace.allObjects()) {
      expect(graph.hasEdge(id, id)).toBe(false)
    }
  })

  it('creates no outgoing edges for objects with no deps', async () => {
    const workspace = new Workspace(loadSpexSpecs(specsDir))
    const graph = buildDependencyGraph(workspace)

    // Built-ins like string have no deps
    expect(graph.outDegree(objectId('builtin', 'string'))).toBe(0)
    expect(graph.outDegree(objectId('builtin', 'number'))).toBe(0)
  })
})

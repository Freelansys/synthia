import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSpexSpecs, loadSpexSpecsRecursive } from '../src/parse/index.js'
import { Workspace, objectId, BUILTIN_NAMESPACE, BUILTIN_TYPES } from '../src/workspace/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const propsDir = resolve(__dirname, 'props')
const specsDir = resolve(propsDir, 'specs')
const importsDir = resolve(propsDir, 'imports')

describe('objectId', () => {
  it('formats a file:// URI with path and name', async () => {
    const id = objectId('/project/specs/todo.spex', 'CreateTodo')
    expect(id).toBe('file:///project/specs/todo.spex::CreateTodo')
  })
})

describe('Workspace', () => {
  it('includes built-in types', async () => {
    const workspace = new Workspace([])

    for (const name of BUILTIN_TYPES) {
      const id = objectId(BUILTIN_NAMESPACE, name)
      const decl = workspace.getObject(id)
      expect(decl?.kind).toBe('ObjectDeclaration')
      expect(decl?.name).toBe(name)
    }
  })

  it('collects all ObjectDeclarations from parsed specs plus built-ins', async () => {
    const specs = loadSpexSpecs(specsDir)
    const workspace = new Workspace(specs)

    expect(workspace.objects.size).toBe(4 + BUILTIN_TYPES.length)

    const todoId = objectId(resolve(specsDir, 'model.spex'), 'Todo')
    const addTodoId = objectId(resolve(specsDir, 'model.spex'), 'AddTodo')
    const schemaId = objectId(resolve(specsDir, 'schema.spex'), 'Schema')
    const validId = objectId(resolve(specsDir, 'valid.spex'), 'Valid')

    expect(workspace.getObject(todoId)?.name).toBe('Todo')
    expect(workspace.getObject(addTodoId)?.name).toBe('AddTodo')
    expect(workspace.getObject(schemaId)?.name).toBe('Schema')
    expect(workspace.getObject(validId)?.name).toBe('Valid')
  })

  it('collects objects from recursively loaded specs plus built-ins', async () => {
    const specs = loadSpexSpecsRecursive(importsDir)
    const workspace = new Workspace(specs)

    expect(workspace.objects.size).toBe(3 + BUILTIN_TYPES.length)

    const signUpId = objectId(resolve(importsDir, 'main.spex'), 'SignUp')
    const emailId = objectId(resolve(importsDir, 'types.spex'), 'EmailAddress')
    const passwordId = objectId(resolve(importsDir, 'types.spex'), 'Password')

    expect(workspace.getObject(signUpId)?.name).toBe('SignUp')
    expect(workspace.getObject(emailId)?.name).toBe('EmailAddress')
    expect(workspace.getObject(passwordId)?.name).toBe('Password')
  })

  it('returns undefined for unknown object ids', async () => {
    const workspace = new Workspace([])
    expect(workspace.getObject('file:///none.spex::Nope')).toBeUndefined()
  })

  it('allObjects yields all entries including built-ins', async () => {
    const workspace = new Workspace([])
    const entries = Array.from(workspace.allObjects())

    expect(entries).toHaveLength(BUILTIN_TYPES.length)
    entries.forEach(([id, decl]) => {
      expect(id).toMatch(/^file:\/\//)
      expect(decl.kind).toBe('ObjectDeclaration')
    })
  })
})

import {
  type GenerateDeclaration,
  type ObjectDeclaration,
  type PackageDeclaration,
} from 'spex-parser'
import { type ParsedSpexFile } from '../parse/index.js'

export const BUILTIN_NAMESPACE = 'builtin'

export const BUILTIN_TYPES = ['string', 'number', 'bool', 'unit'] as const

export function objectId(filePath: string, name: string): string {
  return `file://${filePath}::${name}`
}

function builtinDeclaration(name: string): ObjectDeclaration {
  return { kind: 'ObjectDeclaration', name, object: { kind: 'NamedObject', name } }
}

export type EntryDeclaration = GenerateDeclaration | PackageDeclaration

export class Workspace {
  readonly objects: Map<string, ObjectDeclaration> = new Map()
  readonly scopes: Map<string, Map<string, string>> = new Map()
  readonly entryPoints: Array<{ filePath: string; declaration: EntryDeclaration }> = []

  constructor(specs: ParsedSpexFile[]) {
    for (const name of BUILTIN_TYPES) {
      const id = objectId(BUILTIN_NAMESPACE, name)
      this.objects.set(id, builtinDeclaration(name))
    }

    for (const spec of specs) {
      const fileScope = new Map<string, string>()

      for (const decl of spec.ast.declarations) {
        if (decl.kind === 'ObjectDeclaration') {
          const id = objectId(spec.filePath, decl.name)
          this.objects.set(id, decl)
          fileScope.set(decl.name, id)
        } else if (decl.kind === 'GenerateDeclaration' || decl.kind === 'PackageDeclaration') {
          this.entryPoints.push({ filePath: spec.filePath, declaration: decl })
        }
      }

      this.scopes.set(spec.filePath, fileScope)
    }
  }

  getObject(id: string): ObjectDeclaration | undefined {
    return this.objects.get(id)
  }

  resolveName(name: string, fromFile?: string): string | undefined {
    if (fromFile) {
      const fileScope = this.scopes.get(fromFile)
      if (fileScope?.has(name)) {
        return fileScope.get(name)
      }
    }

    for (const [id, decl] of this.objects) {
      if (decl.name === name) return id
    }
    return undefined
  }

  getScope(filePath: string): Map<string, string> | undefined {
    return this.scopes.get(filePath)
  }

  *allObjects(): IterableIterator<[string, ObjectDeclaration]> {
    yield* this.objects.entries()
  }
}

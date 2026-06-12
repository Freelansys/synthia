import { type ObjectDeclaration } from 'spex-parser'
import { type ParsedSpexFile } from '../parse/index.js'

export function objectId(filePath: string, name: string): string {
  return `file://${filePath}::${name}`
}

export class Workspace {
  readonly objects: Map<string, ObjectDeclaration> = new Map()

  constructor(specs: ParsedSpexFile[]) {
    for (const spec of specs) {
      for (const decl of spec.ast.declarations) {
        if (decl.kind === 'ObjectDeclaration') {
          const id = objectId(spec.filePath, decl.name)
          this.objects.set(id, decl)
        }
      }
    }
  }

  getObject(id: string): ObjectDeclaration | undefined {
    return this.objects.get(id)
  }

  *allObjects(): IterableIterator<[string, ObjectDeclaration]> {
    yield* this.objects.entries()
  }
}

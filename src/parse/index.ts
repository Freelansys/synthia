import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseToAst, type SpexFile } from 'spex-parser'

export interface ParsedSpexFile {
  filePath: string
  ast: SpexFile
}

export function findSpexFiles(specDir: string): string[] {
  const resolved = resolve(specDir)
  const result: string[] = []
  const stack = [resolved]

  while (stack.length > 0) {
    const dir = stack.pop()!
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.spex')) {
        result.push(fullPath)
      }
    }
  }

  return result
}

export function parseSingleSpexFile(filePath: string): ParsedSpexFile {
  return {
    filePath,
    ast: parseToAst(readFileSync(filePath, 'utf-8')),
  }
}

export function parseSpexFiles(filePaths: string[]): ParsedSpexFile[] {
  return filePaths.map(parseSingleSpexFile)
}

export function loadSpexSpecs(specDir: string): ParsedSpexFile[] {
  const files = findSpexFiles(specDir)
  return parseSpexFiles(files)
}

export function resolveImportPath(importingFile: string, source: string): string {
  return resolve(dirname(importingFile), source)
}

export function loadSpexSpecsRecursive(specDir: string): ParsedSpexFile[] {
  const entryFiles = findSpexFiles(specDir)
  const visited = new Set<string>()
  const result: ParsedSpexFile[] = []

  for (const file of entryFiles) {
    collectWithImports(file, visited, result)
  }

  return result
}

function collectWithImports(
  filePath: string,
  visited: Set<string>,
  result: ParsedSpexFile[]
): void {
  const resolved = resolve(filePath)
  if (visited.has(resolved)) return
  visited.add(resolved)

  const parsed = parseSingleSpexFile(resolved)
  result.push(parsed)

  for (const decl of parsed.ast.declarations) {
    if (decl.kind === 'ImportDeclaration') {
      const importPath = resolveImportPath(resolved, decl.source)
      collectWithImports(importPath, visited, result)
    }
  }
}

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseToAst, type SpexFile } from 'spex-parser'

export interface ParsedSpexFile {
  filePath: string
  ast: SpexFile
}

export function findSpexFiles(specDir: string): string[] {
  const resolved = resolve(specDir)
  const entries = readdirSync(resolved, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.spex'))
    .map((e) => resolve(resolved, e.name))
}

export function parseSpexFiles(filePaths: string[]): ParsedSpexFile[] {
  return filePaths.map((filePath) => ({
    filePath,
    ast: parseToAst(readFileSync(filePath, 'utf-8')),
  }))
}

export function loadSpexSpecs(specDir: string): ParsedSpexFile[] {
  const files = findSpexFiles(specDir)
  return parseSpexFiles(files)
}

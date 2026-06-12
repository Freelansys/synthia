import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  findSpexFiles,
  parseSpexFiles,
  loadSpexSpecs,
  loadSpexSpecsRecursive,
  resolveImportPath,
} from '../src/parse/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const propsDir = resolve(__dirname, 'props')
const specsDir = resolve(propsDir, 'specs')
const emptySpecsDir = resolve(propsDir, 'empty-specs')
const importsDir = resolve(propsDir, 'imports')

describe('findSpexFiles', () => {
  it('returns only .spex files from the directory', async () => {
    const result = findSpexFiles(specsDir)

    expect(result).toHaveLength(4)
    expect(result.every((p) => p.endsWith('.spex'))).toBe(true)
  })

  it('returns empty array when no .spex files exist', async () => {
    const result = findSpexFiles(emptySpecsDir)

    expect(result).toEqual([])
  })

  it('throws when directory does not exist', async () => {
    expect(() => findSpexFiles('/nonexistent/path')).toThrow()
  })
})

describe('parseSpexFiles', () => {
  it('parses each file and returns ParsedSpexFile array', async () => {
    const result = parseSpexFiles([
      resolve(specsDir, 'model.spex'),
      resolve(specsDir, 'schema.spex'),
    ])

    expect(result).toHaveLength(2)
    expect(result[0].filePath).toBe(resolve(specsDir, 'model.spex'))
    expect(result[1].filePath).toBe(resolve(specsDir, 'schema.spex'))
  })

  it('throws when a file cannot be read', async () => {
    expect(() => parseSpexFiles(['/nonexistent/file.spex'])).toThrow()
  })

  it('returns empty array for empty input', async () => {
    const result = parseSpexFiles([])

    expect(result).toEqual([])
  })
})

describe('loadSpexSpecs', () => {
  it('finds and parses all .spex files in a directory', async () => {
    const result = loadSpexSpecs(specsDir)

    expect(result).toHaveLength(4)
  })

  it('returns empty array when no .spex files exist', async () => {
    const result = loadSpexSpecs(emptySpecsDir)

    expect(result).toEqual([])
  })

  it('throws on directory read failure', async () => {
    expect(() => loadSpexSpecs('/nonexistent/path')).toThrow()
  })
})

describe('resolveImportPath', () => {
  it('resolves a relative source path against the importing file', async () => {
    const result = resolveImportPath('/project/specs/models/user.spex', 'types.spex')
    expect(result).toBe('/project/specs/models/types.spex')
  })

  it('resolves a parent-relative source path', async () => {
    const result = resolveImportPath('/project/specs/sub/helper.spex', '../types.spex')
    expect(result).toBe('/project/specs/types.spex')
  })

  it('resolves an absolute source path', async () => {
    const result = resolveImportPath('/project/specs/models/user.spex', '/other/types.spex')
    expect(result).toBe('/other/types.spex')
  })
})

describe('loadSpexSpecsRecursive', () => {
  it('parses entry files and their imports', async () => {
    const result = loadSpexSpecsRecursive(importsDir)

    expect(result).toHaveLength(3)
    const paths = result.map((p) => p.filePath).sort()
    expect(paths).toContain(resolve(importsDir, 'main.spex'))
    expect(paths).toContain(resolve(importsDir, 'types.spex'))
    expect(paths).toContain(resolve(importsDir, 'sub/helper.spex'))
  })

  it('does not duplicate files imported by multiple entry points', async () => {
    const result = loadSpexSpecsRecursive(importsDir)
    const paths = result.map((p) => p.filePath)
    const unique = new Set(paths)

    expect(unique.size).toBe(paths.length)
  })

  it('returns empty array for a directory with no .spex files', async () => {
    const result = loadSpexSpecsRecursive(emptySpecsDir)

    expect(result).toEqual([])
  })

  it('throws when a directory does not exist', async () => {
    expect(() => loadSpexSpecsRecursive('/nonexistent/path')).toThrow()
  })
})

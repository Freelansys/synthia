import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { findSpexFiles, parseSpexFiles, loadSpexSpecs } from "../src/parse/index.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const propsDir = resolve(__dirname, 'props')
const specsDir = resolve(propsDir, 'specs')
const emptySpecsDir = resolve(propsDir, 'empty-specs')

describe('findSpexFiles', () => {
  it('returns only .spex files from the directory', async () => {
    const result = findSpexFiles(specsDir)

    expect(result).toHaveLength(3)
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

    expect(result).toHaveLength(3)
  })

  it('returns empty array when no .spex files exist', async () => {
    const result = loadSpexSpecs(emptySpecsDir)

    expect(result).toEqual([])
  })

  it('throws on directory read failure', async () => {
    expect(() => loadSpexSpecs('/nonexistent/path')).toThrow()
  })
})

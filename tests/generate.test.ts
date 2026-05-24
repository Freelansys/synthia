import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@iarna/toml'
import { describe, expect, it, vi, afterEach } from 'vitest'

import { loadConfig, mergeOptions } from '../src/cli/commands/generate.js'

vi.mock('node:fs')
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('path')>('node:path')
  return { ...actual, resolve: vi.fn((p: string) => `/resolved/${p}`) }
})
vi.mock('@iarna/toml', async () => {
  const actual = await vi.importActual<typeof import('@iarna/toml')>('@iarna/toml')
  return { ...actual, parse: vi.fn() }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('loadConfig', () => {
  it('parses a TOML file and returns SpexConfig', async () => {
    const tomlParse = parse as unknown as ReturnType<typeof vi.fn>

    tomlParse.mockReturnValue({ target: { language: 'python' } })
    vi.mocked(readFileSync).mockReturnValue('[target]\nlanguage = "python"')

    const result = loadConfig('spex.toml')

    expect(resolve).toHaveBeenCalledWith('spex.toml')
    expect(readFileSync).toHaveBeenCalledWith('/resolved/spex.toml', 'utf-8')
    expect(tomlParse).toHaveBeenCalledWith('[target]\nlanguage = "python"')
    expect(result).toEqual({ target: { language: 'python' } })
  })

  it('throws when file does not exist', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    expect(() => loadConfig('nonexistent.toml')).toThrow('ENOENT')
  })

  it('throws on invalid TOML', async () => {
    const tomlParse = parse as unknown as ReturnType<typeof vi.fn>

    vi.mocked(readFileSync).mockReturnValue('invalid [[toml')
    tomlParse.mockImplementation(() => {
      throw new Error('Unexpected character')
    })

    expect(() => loadConfig('bad.toml')).toThrow('Unexpected character')
  })
})

describe('mergeOptions', () => {
  it('uses CLI output over config and default', async () => {
    const result = mergeOptions(
      { workspace: { output_dir: './config-out' } },
      { output: './cli-out', target: 'python' }
    )

    expect(result).toEqual({ output: './cli-out', target: 'python' })
  })

  it('uses config output_dir when CLI output is absent', async () => {
    const result = mergeOptions({ workspace: { output_dir: './config-out' } }, { target: 'python' })

    expect(result).toEqual({ output: './config-out', target: 'python' })
  })

  it('falls back to default output when neither CLI nor config has it', async () => {
    const result = mergeOptions({}, {})

    expect(result).toEqual({ output: './src/generated', target: 'typescript' })
  })

  it('uses config target language when CLI target is absent', async () => {
    const result = mergeOptions({ target: { language: 'go' } }, { output: './out' })

    expect(result).toEqual({ output: './out', target: 'go' })
  })

  it('handles empty config sections', async () => {
    const result = mergeOptions({ workspace: {}, target: {} }, {})

    expect(result).toEqual({ output: './src/generated', target: 'typescript' })
  })

  it('handles undefined config sections', async () => {
    const result = mergeOptions({ workspace: {}, target: {} }, {})

    expect(result).toEqual({ output: './src/generated', target: 'typescript' })
  })

  it('prioritizes CLI over config for both options', async () => {
    const result = mergeOptions(
      { workspace: { output_dir: './config-out' }, target: { language: 'rust' } },
      { output: './cli-out', target: 'java' }
    )

    expect(result).toEqual({ output: './cli-out', target: 'java' })
  })
})

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadConfig, mergeOptions } from '../src/cli/commands/generate.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const propsDir = resolve(__dirname, 'props')
const configPath = resolve(propsDir, 'config.toml')
const minimalConfigPath = resolve(propsDir, 'minimal.toml')

describe('loadConfig', () => {
  it('parses a TOML file and returns SpexConfig', async () => {
    const result = loadConfig(configPath)

    expect(result).toEqual({
      target: { language: 'typescript', runtime: 'node' },
      workspace: { spec_dir: './specs', output_dir: './out' },
    })
  })

  it('returns empty config for minimal TOML', async () => {
    const result = loadConfig(minimalConfigPath)

    expect(result).toEqual({})
  })

  it('throws when file does not exist', async () => {
    expect(() => loadConfig('/nonexistent/path.toml')).toThrow()
  })

  it('throws on invalid TOML', async () => {
    const invalidPath = resolve(propsDir, 'invalid.toml')

    expect(() => loadConfig(invalidPath)).toThrow()
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

  it('merges options from a real config file', async () => {
    const config = loadConfig(configPath)

    const result1 = mergeOptions(config, {})
    expect(result1).toEqual({ output: './out', target: 'typescript' })

    const result2 = mergeOptions(config, { output: './cli', target: 'python' })
    expect(result2).toEqual({ output: './cli', target: 'python' })

    const result3 = mergeOptions(config, { target: 'rust' })
    expect(result3).toEqual({ output: './out', target: 'rust' })
  })
})

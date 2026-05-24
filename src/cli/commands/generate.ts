import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@iarna/toml'
import { Command } from 'commander'

export interface SpexConfig {
  target?: {
    language?: string
    runtime?: string
  }
  generation?: {
    strategy?: string
    beam_width?: number
  }
  architecture?: {
    style?: string
    functional?: boolean
  }
  verification?: {
    tests?: boolean
    typecheck?: boolean
  }
  workspace?: {
    spec_dir?: string
    output_dir?: string
  }
}

export function loadConfig(filePath: string): SpexConfig {
  const resolvedPath = resolve(filePath)
  const raw = readFileSync(resolvedPath, 'utf-8')
  return parse(raw) as SpexConfig
}

export function mergeOptions(
  config: SpexConfig,
  cliOptions: { output?: string; target?: string }
): {
  output: string
  target: string
} {
  return {
    output: cliOptions.output ?? config.workspace?.output_dir ?? './src/generated',
    target: cliOptions.target ?? config.target?.language ?? 'typescript',
  }
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Synthesize software from Spex specifications')
    .argument('[spec]', 'path to Spex specification file', 'spex.toml')
    .option('-o, --output <path>', 'output directory for generated code', './src/generated')
    .option('-t, --target <language>', 'target language/runtime', 'typescript')
    .action(async (spec: string, options: { output?: string; target?: string }) => {
      const config = loadConfig(spec)
      const merged = mergeOptions(config, options)

      console.log(`Config file: ${spec}`)
      console.log(`Output directory: ${merged.output}`)
      console.log(`Target: ${merged.target}`)
    })
}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { parse } from '@iarna/toml'
import { Command } from 'commander'
import { logger } from '../../logger.js'
import { compileEntryPoint } from '../../generate/compile.js'
import { loadSpexSpecsRecursive, type ParsedSpexFile } from '../../parse/index.js'
import { Workspace } from '../../workspace/index.js'
import { buildDependencyGraph, computeSCC, condensationGraph } from '../../workspace/graph.js'
import { type LLMConfig } from '../../generate/llm.js'

export interface SpexConfig {
  target?: {
    language?: string
    runtime?: string
  }
  llm?: LLMConfig
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

export function saveAsts(specs: ParsedSpexFile[], configDir: string, specDir: string): string[] {
  const synthiaDir = resolve(configDir, '.synthia')
  mkdirSync(synthiaDir, { recursive: true })

  const paths: string[] = []
  for (const spec of specs) {
    const rel = dirname(relative(specDir, spec.filePath))
    const dir = resolve(synthiaDir, rel)
    mkdirSync(dir, { recursive: true })
    const name = basename(spec.filePath, '.spex') + '.json'
    const outPath = resolve(dir, name)
    writeFileSync(outPath, JSON.stringify(spec, null, 2), 'utf-8')
    paths.push(outPath)
  }
  return paths
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Synthesize software from Spex specifications')
    .argument('[spec]', 'path to Spex specification file', 'spex.toml')
    .option('-o, --output <path>', 'output directory for generated code', './src/generated')
    .option('-t, --target <language>', 'target language/runtime', 'typescript')
    .action(async (spec: string, options: { output?: string; target?: string }) => {
      try {
        const configDir = dirname(resolve(spec))
        const config = loadConfig(spec)
        const merged = mergeOptions(config, options)

        logger.info(`config file: ${spec}`)
        logger.info(`output directory: ${merged.output}`)
        logger.info(`target: ${merged.target}`)

        const specDir = config.workspace?.spec_dir ?? configDir
        const specs = loadSpexSpecsRecursive(specDir)
        const workspace = new Workspace(specs)

        const depGraph = buildDependencyGraph(workspace)
        const scc = computeSCC(depGraph)
        const cg = condensationGraph(depGraph, scc)

        const outputDir = resolve(merged.output)
        mkdirSync(outputDir, { recursive: true })

        const cacheDir = resolve(configDir, '.synthia')

        const allArtifacts: string[] = []
        for (const entryPoint of workspace.entryPoints) {
          const artifacts = await compileEntryPoint(
            workspace,
            depGraph,
            scc,
            cg,
            entryPoint,
            cacheDir,
            config.llm,
            config.architecture
          )
          allArtifacts.push(...artifacts)
        }

        logger.info(
          `generated ${allArtifacts.length} artifact(s) across ${workspace.entryPoints.length} entry point(s)`
        )
      } catch (err) {
        logger.error(`generate failed: ${(err as Error).message}`)
        process.exit(1)
      }
    })
}

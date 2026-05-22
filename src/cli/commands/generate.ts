import { Command } from 'commander'

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Synthesize software from Spex specifications')
    .argument('[spec]', 'path to Spex specification file', 'spex.toml')
    .option('-o, --output <path>', 'output directory for generated code', './src/generated')
    .option('-t, --target <language>', 'target language/runtime', 'typescript')
    .action(async (spec: string, options: { output: string; target: string }) => {
      console.log(`Generating from: ${spec}`)
      console.log(`Output directory: ${options.output}`)
      console.log(`Target: ${options.target}`)
    })
}

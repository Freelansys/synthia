import { Command } from 'commander'
import { registerGenerateCommand } from './commands/generate.js'

export function createCLI(): Command {
  const program = new Command()

  program
    .name('synthia')
    .description(
      'Semantic software synthesis agent that transforms Spex specifications into executable systems'
    )
    .version('0.1.0')

  registerGenerateCommand(program)

  return program
}

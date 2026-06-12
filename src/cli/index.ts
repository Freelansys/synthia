import { Command } from 'commander'
import { logger } from '../logger.js'
import { registerGenerateCommand } from './commands/generate.js'

export function createCLI(): Command {
  const program = new Command()

  program
    .name('synthia')
    .description(
      'Semantic software synthesis agent that transforms Spex specifications into executable systems'
    )
    .version('0.1.0')
    .exitOverride()

  program.configureOutput({
    writeErr: (msg: string) => logger.error(msg.trimEnd()),
    writeOut: (msg: string) => logger.log(msg.trimEnd()),
  })

  registerGenerateCommand(program)

  return program
}

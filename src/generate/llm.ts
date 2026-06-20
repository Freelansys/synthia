import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, type LanguageModel } from 'ai'
import { logger } from '../logger.js'

export interface LLMConfig {
  provider?: string
  baseURL?: string
  model: string
  temperature?: number
  maxOutputTokens?: number
}

export interface GenerateCodeParams {
  systemPrompt: string
  userPrompt: string
  config: LLMConfig
}

function resolveModel(config: LLMConfig): LanguageModel {
  switch (config.provider) {
    case 'anthropic':
      return createAnthropic()(config.model)
    default:
      return createOpenAICompatible({
        name: 'openai',
        baseURL: config.baseURL ?? 'https://api.openai.com/v1',
      })(config.model)
  }
}

export async function generateCode(params: GenerateCodeParams): Promise<string> {
  const { systemPrompt, userPrompt, config } = params

  const model = resolveModel(config)

  logger.debug(
    `LLM call: provider=${config.provider ?? 'openai'}, model=${config.model}, temperature=${config.temperature ?? 0.7}`
  )

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: config.temperature ?? 0.7,
    ...(config.maxOutputTokens !== undefined && { maxOutputTokens: config.maxOutputTokens }),
  })

  return result.text.trim()
}

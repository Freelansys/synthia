import { type ObjectDeclaration, type ObjectExpression } from 'spex-parser'
import { renderSystem, renderUser } from './prompts/index.js'
import { type LLMConfig } from './llm.js'

export interface BuildPromptParams {
  decl: ObjectDeclaration
  dependencyCode: string
  siblingDeclarations: string
  targetLanguage: string
  llmConfig?: LLMConfig
  archStyle?: string
  functional?: boolean
}

function renderExpression(expr: ObjectExpression): string {
  switch (expr.kind) {
    case 'NamedObject':
      return expr.name
    case 'ProductObject': {
      const fields = Object.entries(expr.fields).map(
        ([key, val]) => `    ${key}: ${renderExpression(val)}`
      )
      return `(\n${fields.join(',\n')}\n  )`
    }
    case 'ExponentialObject':
      return `from ${renderExpression(expr.base)} -> ${renderExpression(expr.exponent)}`
    case 'SubObject': {
      const parts: string[] = []
      for (const part of expr.constraint.parts) {
        if (part.kind === 'ConstraintText') {
          parts.push(`  - ${part.text}`)
        } else if (part.kind === 'ConstraintReference') {
          parts.push(`  - @${part.name}`)
        }
      }
      return `${renderExpression(expr.base)} select {\n${parts.join('\n')}\n}`
    }
    case 'ArrayObject':
      return `Array<${renderExpression(expr.base)}>`
  }
}

function renderDeclaration(decl: ObjectDeclaration): string {
  return `create ${decl.name} as ${renderExpression(decl.object)};`
}

export function renderDeclarationsForContext(deels: ObjectDeclaration[]): string {
  return deels.map(renderDeclaration).join('\n')
}

export function buildSystemPrompt(params: {
  targetLanguage: string
  archStyle?: string
  functional?: boolean
}): string {
  return renderSystem({
    targetLanguage: params.targetLanguage,
    archStyleLine: params.archStyle ? `Architecture style: ${params.archStyle}` : '',
    functionalLine: params.functional ? 'Style: Use pure functions and immutability.' : '',
  })
}

export function buildUserPrompt(params: BuildPromptParams): string {
  const { decl, dependencyCode, siblingDeclarations, targetLanguage } = params
  const objectKind = decl.object.kind

  const dependencyHeader = dependencyCode
    ? 'The following types and functions are already defined in the project:\n'
    : ''
  const siblingHeader = siblingDeclarations
    ? 'The following types are defined alongside this one (in the same specification):\n'
    : ''

  return renderUser(objectKind, {
    dependencyHeader,
    dependencyCode,
    siblingHeader,
    siblingDeclarations,
    targetLanguage,
    declaration: renderDeclaration(decl),
    objectName: decl.name,
  })
}

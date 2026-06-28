import {
  type ExponentialObject,
  type ObjectDeclaration,
  type ObjectExpression,
  type SubObject,
} from 'spex-parser'
import { renderSystem, renderUser } from './prompts/index.js'
import { type LLMConfig } from './llm.js'
import { Workspace, BUILTIN_TYPES } from '../workspace/index.js'

export interface BuildPromptParams {
  decl: ObjectDeclaration
  dependencyCode: string
  siblingDeclarations: string
  targetLanguage: string
  llmConfig?: LLMConfig
  archStyle?: string
  functional?: boolean
  workspace?: Workspace
  sourceId?: string
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
      return `${renderExpression(expr.base)} -> ${renderExpression(expr.exponent)}`
    case 'SubObject': {
      const parts: string[] = []
      for (const part of expr.constraint.parts) {
        if (part.kind === 'ConstraintText') {
          parts.push(`  - ${part.text}`)
        } else if (part.kind === 'ConstraintReference') {
          parts.push(`  - @${part.name}`)
        }
      }
      return `${renderExpression(expr.base)} such that {\n${parts.join('\n')}\n}`
    }
    case 'ArrayObject':
      return `Array<${renderExpression(expr.base)}>`
  }
}

function flattenParamList(
  expr: ObjectExpression,
  workspace?: Workspace,
  filePath?: string,
  visited?: Set<string>
): string | null {
  const seen = visited ?? new Set<string>()

  switch (expr.kind) {
    case 'ProductObject':
      return Object.entries(expr.fields)
        .map(([key, val]) => `${key}: ${renderExpression(val)}`)
        .join(', ')

    case 'NamedObject': {
      if (!workspace) return null
      const id = workspace.resolveName(expr.name, filePath)
      if (!id || seen.has(id)) return null
      seen.add(id)
      const decl = workspace.getObject(id)
      if (!decl || decl.object.kind !== 'ProductObject') return null
      return flattenParamList(decl.object, workspace, filePath, seen)
    }

    default:
      return null
  }
}

function renderSubObjectPseudoCode(
  decl: ObjectDeclaration,
  workspace?: Workspace,
  sourceId?: string
): string {
  const subObj = decl.object as SubObject
  const isClassifier = subObj.base.kind !== 'ExponentialObject'

  const filePath = sourceId?.startsWith('file://') ? sourceId.slice(7).split('::')[0] : undefined

  const lines: string[] = []

  if (isClassifier) {
    const baseType = renderExpression(subObj.base)
    lines.push(`function is${decl.name}(input: ${baseType}): boolean {`)
  } else {
    const expObj = subObj.base as ExponentialObject
    const domainType = renderExpression(expObj.exponent)
    const codomainType = renderExpression(expObj.base)

    const flatParams = flattenParamList(expObj.exponent, workspace, filePath)
    if (flatParams) {
      lines.push(`function ${decl.name}(${flatParams}): ${codomainType} {`)
    } else {
      lines.push(`function ${decl.name}(input: ${domainType}): ${codomainType} {`)
    }
  }

  let pendingText = ''
  const refs: Array<{ name: string; resolved: boolean }> = []

  for (const part of subObj.constraint.parts) {
    if (part.kind === 'ConstraintText') {
      pendingText += part.text
    } else if (part.kind === 'ConstraintReference') {
      pendingText += `@${part.name}`
      const resolvedId = workspace?.resolveName(part.name, filePath)
      refs.push({ name: part.name, resolved: !!resolvedId })
    }
  }

  if (pendingText.trim()) {
    for (const line of pendingText.trim().split('\n')) {
      lines.push(`  // ${line.trim()}`)
    }
  }

  for (const ref of refs) {
    if (ref.resolved) {
      lines.push(`  check(is${ref.name}(input))  // @${ref.name}`)
    } else {
      lines.push(`  // @${ref.name}  →  input.${ref.name}`)
    }
  }

  lines.push(`  return ...`)
  lines.push(`}`)

  return lines.join('\n')
}

function renderDeclaration(decl: ObjectDeclaration): string {
  return `create ${decl.name} as ${renderExpression(decl.object)};`
}

export function renderDeclarationsForContext(deels: ObjectDeclaration[]): string {
  return deels.map(renderDeclaration).join('\n')
}

function isClassifierBase(expr: ObjectExpression): boolean {
  return expr.kind !== 'ExponentialObject'
}

function resolveNamedDeclaration(
  decl: ObjectDeclaration,
  workspace?: Workspace,
  sourceId?: string
): string | undefined {
  if (decl.object.kind !== 'NamedObject') return undefined

  const name = decl.object.name
  if ((BUILTIN_TYPES as readonly string[]).includes(name)) return name

  if (!workspace) return undefined

  const filePath = sourceId?.startsWith('file://') ? sourceId.slice(7).split('::')[0] : undefined
  const resolvedId = workspace.resolveName(name, filePath)
  if (!resolvedId) return undefined

  const resolvedDecl = workspace.getObject(resolvedId)
  if (!resolvedDecl) return undefined

  return renderDeclaration(resolvedDecl)
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
  const {
    decl,
    dependencyCode,
    siblingDeclarations,
    targetLanguage,
    archStyle,
    workspace,
    sourceId,
  } = params
  const objectKind = decl.object.kind

  const dependencyHeader = dependencyCode
    ? 'The following types and functions are already defined in the project:\n'
    : ''
  const siblingHeader = siblingDeclarations
    ? 'The following types are defined alongside this one (in the same specification):\n'
    : ''

  const vars: Record<string, string> = {
    dependencyHeader,
    dependencyCode,
    siblingHeader,
    siblingDeclarations,
    targetLanguage,
    declaration: renderDeclaration(decl),
    objectName: decl.name,
    archStyle: archStyle ?? '',
    baseTypeName: '',
    typeInstruction: '',
    resolvedDeclaration: '',
  }

  let baseCategory: string | undefined

  if (objectKind === 'SubObject') {
    const base = (decl.object as SubObject).base
    const baseRendered = renderExpression(base)
    vars.baseTypeName = baseRendered
    vars.declaration = renderSubObjectPseudoCode(decl, workspace, sourceId)

    baseCategory = isClassifierBase(base) ? 'classifier' : 'function'
  }

  if (objectKind === 'NamedObject') {
    const resolved = resolveNamedDeclaration(decl, workspace, sourceId)
    vars.resolvedDeclaration = resolved ?? '(unknown)'
  }

  return renderUser(objectKind, vars, baseCategory)
}

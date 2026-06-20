import { render as mustacheRender } from 'micromustache'
import systemPrompt from './system.prompt.js'
import dataPrompt from './user/data.prompt.js'
import functionPrompt from './user/function.prompt.js'
import constraintClassifierPrompt from './user/constraint-classifier.prompt.js'
import constraintFunctionPrompt from './user/constraint-function.prompt.js'
import namedPrompt from './user/named.prompt.js'
import collectionPrompt from './user/collection.prompt.js'

export function renderSystem(vars: Record<string, string>): string {
  return mustacheRender(systemPrompt, vars)
}

export function renderUser(
  objectKind: string,
  vars: Record<string, string>,
  baseCategory?: string
): string {
  let template: string

  switch (objectKind) {
    case 'SubObject':
      template = baseCategory === 'function' ? constraintFunctionPrompt : constraintClassifierPrompt
      break
    case 'NamedObject':
      template = namedPrompt
      break
    case 'ProductObject':
      template = dataPrompt
      break
    case 'ExponentialObject':
      template = functionPrompt
      break
    case 'ArrayObject':
      template = collectionPrompt
      break
    default:
      throw new Error(`unknown object kind: ${objectKind}`)
  }

  return mustacheRender(template, vars)
}

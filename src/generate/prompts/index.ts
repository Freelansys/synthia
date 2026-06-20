import { render as mustacheRender } from 'micromustache'
import systemPrompt from './system.prompt.js'
import dataPrompt from './user/data.prompt.js'
import functionPrompt from './user/function.prompt.js'
import constraintPrompt from './user/constraint.prompt.js'
import collectionPrompt from './user/collection.prompt.js'

export function renderSystem(vars: Record<string, string>): string {
  return mustacheRender(systemPrompt, vars)
}

const USER_TEMPLATES: Record<string, string> = {
  NamedObject: dataPrompt,
  ProductObject: dataPrompt,
  ExponentialObject: functionPrompt,
  SubObject: constraintPrompt,
  ArrayObject: collectionPrompt,
}

export function renderUser(objectKind: string, vars: Record<string, string>): string {
  const template = USER_TEMPLATES[objectKind]
  if (!template) {
    throw new Error(`unknown object kind: ${objectKind}`)
  }
  return mustacheRender(template, vars)
}

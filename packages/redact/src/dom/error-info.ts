import { FiberTag, type Fiber } from '../core'

export function componentStack(fiber: Fiber | null): string {
  let stack = ''
  for (; fiber; fiber = fiber.parent) {
    let type = fiber.type
    while (type && typeof type === 'object') type = type.type || type.render
    const name = typeof type === 'string' ? type
      : typeof type === 'function' ? type.displayName || type.name || 'Anonymous'
      : fiber.tag === FiberTag.Suspense ? 'Suspense'
      : fiber.tag === FiberTag.Activity ? 'Activity' : ''
    if (name) stack += '\n    at ' + name
  }
  return stack
}

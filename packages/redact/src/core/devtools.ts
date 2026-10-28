import type { Fiber, FiberRoot, ReactElement } from './index'

// Development metadata lives outside elements and fibers, so the production
// object layouts stay unchanged. Owner metadata also supports captureOwnerStack
// when no DevTools extension is attached.
export const devToolsMetadata = {
  enabled: false,
  owner: null as Fiber | null,
  current: null as Fiber | null,
  errorStack: undefined as string | null | undefined,
  stackBudget: 10000,
  stackResetTime: 0,
  hosts: /* @__PURE__ */ new WeakMap<Node, Fiber>(),
  hydratedRoots: /* @__PURE__ */ new WeakSet<FiberRoot>(),
  elements: /* @__PURE__ */ new WeakMap<object, { owner: Fiber | null; stack: Error | null; source: any }>(),
  fibers: /* @__PURE__ */ new WeakMap<Fiber, { owner: Fiber | null; stack: Error | null; source: any }>(),
}

export function rememberDevToolsElement(element: ReactElement, source?: any, original?: ReactElement): ReactElement {
  const previous = original && devToolsMetadata.elements.get(original)
  devToolsMetadata.elements.set(element, previous || {
    owner: devToolsMetadata.owner,
    // React also caps owner stack capture at 10,000 elements per second.
    // Keep owner relationships, but don't invent a source once the budget ends.
    stack: devToolsMetadata.stackBudget-- > 0 ? new Error('react-stack-top-frame') : null,
    source: source || null,
  })
  return element
}

export function readOwnerStack(fiber: Fiber | null): string | null {
  if (!fiber) return null
  if (!fiber) return null
  let stack = ''
  const seen = new Set<typeof fiber>()
  while (fiber && !seen.has(fiber)) {
    seen.add(fiber)
    const metadata = devToolsMetadata.fibers.get(fiber)
    fiber = metadata?.owner || null
    if (!fiber) break
    let type = fiber.type
    while (type && typeof type === 'object') type = type.type || type.render
    const name = typeof type === 'function' ? type.displayName || type.name || 'Anonymous' : ''
    if (!name) continue
    const frame = metadata?.stack?.stack?.split('\n').find(line =>
      line.includes('at ' + name + ' (') || line.startsWith(name + '@'))
    stack += '\n' + (frame ? frame.startsWith(name + '@') ? '    at ' + name + ' (' + frame.slice(name.length + 1) + ')' : frame : '    at ' + name)
  }
  return stack
}

export function runWithOwnerStack<T>(stack: string | null, callback: () => T): T {
  const previousCurrent = devToolsMetadata.current
  const previousStack = devToolsMetadata.errorStack
  devToolsMetadata.current = null
  devToolsMetadata.errorStack = stack
  try { return callback() } finally {
    devToolsMetadata.current = previousCurrent
    devToolsMetadata.errorStack = previousStack
  }
}

/** Development-only, like React's diagnostic export. */
export let captureOwnerStack: () => string | null
if (process.env.NODE_ENV !== 'production') {
  captureOwnerStack = () => devToolsMetadata.current
    ? readOwnerStack(devToolsMetadata.current)
    : devToolsMetadata.errorStack ?? null
}

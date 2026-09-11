import { FiberTag, type Fiber } from '../../../core'
import { REACT_CONSUMER_TYPE, REACT_CONTEXT_TYPE, REACT_PROVIDER_TYPE } from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  installCapability,
  reconcileChildren,
  childrenToArray,
  renderFiber,
  getHostParent,
  getAnchor,
} from '../../reconcile'

let changingProviders = 0

function contextValue(fiber: Fiber, ctx: any): any {
  let p: Fiber | null = fiber.parent
  while (p) {
    if (p.tag === FiberTag.Provider && (p.type as any)._context === ctx) {
      return (p.pp ?? p.mp)?.value
    }
    p = p.parent
  }
  return ctx._currentValue
}

function remember(fiber: Fiber, ctx: any, value: any): void {
  ;(fiber.cx ??= new Map()).set(ctx, value)
}

function realReadContext(fiber: Fiber, ctx: any): any {
  const value = contextValue(fiber, ctx)
  remember(fiber, ctx, value)
  // Initial suspended attempts are discarded. Keep their external context
  // reads on the boundary so a provider can retry them before a promise settles.
  let child = fiber
  let p = fiber.parent
  while (p) {
    if (p.tag === FiberTag.Provider && p.type._context === ctx) break
    if (p.tag === FiberTag.Suspense && p.ms?.f !== child) remember(p, ctx, value)
    child = p
    p = p.parent
  }
  return value
}

export function ownContextChanged(fiber: Fiber): boolean {
  if (!changingProviders) return false
  const reads = fiber.cx
  if (reads) {
    for (const [ctx, value] of reads) {
      if (!Object.is(value, contextValue(fiber, ctx))) return true
    }
  }
  return false
}

export function hasContextChanged(fiber: Fiber, includeFallback = true): boolean {
  if (!changingProviders) return false
  if (ownContextChanged(fiber)) return true
  let child = fiber.child
  while (child) {
    if (hasContextChanged(child)) return true
    child = child.sibling
  }
  return includeFallback && fiber.tag === FiberTag.Suspense && !!fiber.ms?.f && hasContextChanged(fiber.ms.f)
}

export function renderContextConsumers(fiber: Fiber): void {
  if (!changingProviders) return
  let child = fiber.child
  while (child) {
    if (child.tag === FiberTag.Suspense ? hasContextChanged(child) : ownContextChanged(child)) {
      const domParent = getHostParent(child)
      renderFiber(child, domParent, getAnchor(child, domParent))
    } else {
      renderContextConsumers(child)
    }
    child = child.sibling
  }
}

function renderProvider(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const ctx = (fiber.type as any)._context
  const props = fiber.pp ?? {}
  const changed = fiber.mp && !Object.is(fiber.mp.value, props.value)
  if (changed) changingProviders++
  try {
    reconcileChildren(fiber, childrenToArray(props.children), domParent, anchor)
  } finally {
    if (changed) changingProviders--
  }
  // Also store the value on the fiber so descendants rendering later (via updates)
  // can read through by walking up.
  fiber.ms = props.value
  fiber.mp = props
}

function renderConsumer(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  fiber.cx?.clear()
  const ctx = (fiber.type as any)._context
  const props = fiber.pp ?? {}
  const children = props.children
  const value = realReadContext(fiber, ctx)
  const rendered = typeof children == 'function' ? children(value) : null
  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.mp = props
}

registerTypeMatcher((_type, marker) =>
  marker === REACT_PROVIDER_TYPE || marker === REACT_CONTEXT_TYPE
    ? FiberTag.Provider
    : marker === REACT_CONSUMER_TYPE
      ? FiberTag.Consumer
      : null,
)
registerRenderer(FiberTag.Provider, renderProvider)
registerRenderer(FiberTag.Consumer, renderConsumer)
installCapability('readContext', realReadContext)

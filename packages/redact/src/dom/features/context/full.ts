import { FiberTag, type Fiber } from '../../../core'
import { REACT_PROVIDER_TYPE, REACT_CONSUMER_TYPE } from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  installCapability,
  reconcileChildren,
  childrenToArray,
} from '../../reconcile'

function realReadContext(fiber: Fiber, ctx: any): any {
  let p: Fiber | null = fiber.parent
  while (p) {
    if (p.tag === FiberTag.Provider && (p.type as any)._context === ctx) {
      return (p.pendingProps ?? p.memoizedProps)?.value
    }
    p = p.parent
  }
  return ctx._currentValue
}

function renderProvider(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const ctx = (fiber.type as any)._context
  const props = fiber.pendingProps ?? {}
  const prevValue = ctx._currentValue
  ctx._currentValue = props.value
  try {
    reconcileChildren(fiber, childrenToArray(props.children), domParent, anchor)
  } finally {
    ctx._currentValue = prevValue
  }
  // Also store the value on the fiber so descendants rendering later (via updates)
  // can read through by walking up.
  fiber.memoizedState = props.value
  fiber.memoizedProps = props
}

function renderConsumer(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const ctx = (fiber.type as any)._context
  const props = fiber.pendingProps ?? {}
  const children = props.children
  const value = realReadContext(fiber, ctx)
  const rendered = typeof children === 'function' ? children(value) : null
  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.memoizedProps = props
}

registerTypeMatcher((_type, marker) =>
  marker === REACT_PROVIDER_TYPE
    ? FiberTag.Provider
    : marker === REACT_CONSUMER_TYPE
      ? FiberTag.Consumer
      : null,
)
registerRenderer(FiberTag.Provider, renderProvider)
registerRenderer(FiberTag.Consumer, renderConsumer)
installCapability('readContext', realReadContext)

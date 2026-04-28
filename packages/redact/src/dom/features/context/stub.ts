import { FiberTag, type Fiber } from '../../../core'
import { REACT_PROVIDER_TYPE, REACT_CONSUMER_TYPE } from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  reconcileChildren,
  childrenToArray,
} from '../../reconcile'

// Stub: Context feature disabled. Provider elements render as Fragments
// (value is never propagated — descendants see only the Context's default).
// Consumer elements still invoke their function-children with the default
// value, so `<Ctx.Consumer>{v => ...}</Ctx.Consumer>` patterns keep working.
// The default `readContext` capability returns `ctx._currentValue` without
// walking, which matches the no-Provider-fibers-in-tree reality.
function renderConsumerStub(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const ctx = (fiber.type as any)._context
  const props = fiber.pendingProps ?? {}
  const value = ctx._currentValue
  const rendered = typeof props.children === 'function' ? props.children(value) : null
  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.memoizedProps = props
}

registerTypeMatcher((_type, marker) =>
  marker === REACT_PROVIDER_TYPE
    ? FiberTag.Fragment
    : marker === REACT_CONSUMER_TYPE
      ? FiberTag.Consumer
      : null,
)
registerRenderer(FiberTag.Consumer, renderConsumerStub)

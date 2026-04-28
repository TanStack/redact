import { FiberTag, type Fiber } from '../../../core'
import { REACT_LAZY_TYPE } from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  renderFiber,
  isThenable,
  handleSuspended,
} from '../../reconcile'

// Stub: Lazy feature disabled. Lazy elements still resolve — sync if the
// payload is ready, otherwise the thrown thenable goes through the default
// `handleSuspended` capability (retry-on-settle). What's stripped: the
// hydration-deferred-reveal pathway and the Suspense-awaiting coordination.
function renderLazyStub(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const { _payload, _init } = fiber.type as any
  let resolved: any
  try {
    resolved = _init(_payload)
  } catch (thrown: any) {
    if (isThenable(thrown)) {
      handleSuspended(fiber, thrown)
      return
    }
    throw thrown
  }
  const savedTag = fiber.tag
  const savedType = fiber.type
  fiber.type = resolved
  fiber.tag =
    typeof resolved === 'function'
      ? resolved.prototype?.isReactComponent
        ? FiberTag.Class
        : FiberTag.Function
      : FiberTag.Fragment
  try {
    renderFiber(fiber, domParent, anchor)
  } finally {
    fiber.tag = savedTag
    fiber.type = savedType
  }
}

registerTypeMatcher((_type, marker) => (marker === REACT_LAZY_TYPE ? FiberTag.Lazy : null))
registerRenderer(FiberTag.Lazy, renderLazyStub)

import { FiberTag, type Fiber } from '../../../core'
import { REACT_LAZY_TYPE } from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  renderFiber,
  isThenable,
  handleSuspended,
  deferHydration,
} from '../../reconcile'

function renderLazy(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const { _payload, _init } = fiber.type as any
  let resolved: any
  try {
    resolved = _init(_payload)
  } catch (thenable: any) {
    if (isThenable(thenable)) {
      if (deferHydration(fiber, thenable)) return
      handleSuspended(fiber, thenable)
      // reconcileChildren would be called here if we were rendering children,
      // but Lazy delegates and has no children of its own.
      return
    }
    throw thenable
  }
  const savedTag = fiber.tag
  const savedType = fiber.type
  fiber.type = resolved
  fiber.tag =
    typeof resolved == 'function'
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
registerRenderer(FiberTag.Lazy, renderLazy)

import { FiberTag, type Fiber } from '../../../core'
import {
  REACT_FORWARD_REF_TYPE,
  REACT_MEMO_TYPE,
  REACT_LAZY_TYPE,
} from '../../../react'
import { registerRenderer, registerTypeMatcher, renderFiber } from '../../reconcile'

// Stub: Memo feature disabled. `memo(Component)` still works — the element
// renders — but without the prop-equality gate, so every parent rerender
// passes through to the inner component. `shallowEqual` and the
// forceRerenderingFiber read are stripped.
function renderMemoStub(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const { type } = fiber.type as any

  let innerTag: FiberTag
  if (typeof type === 'function') {
    innerTag = type.prototype?.isReactComponent ? FiberTag.Class : FiberTag.Function
  } else if (type && typeof type === 'object') {
    const m = (type as any).$$typeof
    if (m === REACT_FORWARD_REF_TYPE) innerTag = FiberTag.ForwardRef
    else if (m === REACT_MEMO_TYPE) innerTag = FiberTag.Memo
    else if (m === REACT_LAZY_TYPE) innerTag = FiberTag.Lazy
    else innerTag = FiberTag.Fragment
  } else {
    innerTag = FiberTag.Fragment
  }

  const savedTag = fiber.tag
  const savedType = fiber.type
  fiber.tag = innerTag
  fiber.type = type
  try {
    renderFiber(fiber, domParent, anchor)
  } finally {
    fiber.tag = savedTag
    fiber.type = savedType
  }
}

registerTypeMatcher((_type, marker) => (marker === REACT_MEMO_TYPE ? FiberTag.Memo : null))
registerRenderer(FiberTag.Memo, renderMemoStub)

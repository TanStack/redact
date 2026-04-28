import { FiberTag, type Fiber } from '../../../core'
import { REACT_FORWARD_REF_TYPE } from '../../../react'
import { registerRenderer, registerTypeMatcher, renderFiber } from '../../reconcile'

// Stub: ForwardRef feature disabled. `forwardRef(fn)` elements still render,
// but the ref prop is NOT forwarded — the component is called as a plain
// function with just props. React 19+ supports refs as normal props on
// function components, so most apps can drop forwardRef entirely; this stub
// preserves JSX compatibility while stripping the dispatcher save/restore
// machinery.
function renderForwardRefStub(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const render = (fiber.type as any).render
  const savedTag = fiber.tag
  const savedType = fiber.type
  fiber.type = render
  fiber.tag = FiberTag.Function
  try {
    renderFiber(fiber, domParent, anchor)
  } finally {
    fiber.tag = savedTag
    fiber.type = savedType
  }
}

registerTypeMatcher((_type, marker) =>
  marker === REACT_FORWARD_REF_TYPE ? FiberTag.ForwardRef : null,
)
registerRenderer(FiberTag.ForwardRef, renderForwardRefStub)

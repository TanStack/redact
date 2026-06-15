import { FiberTag, type Fiber, type ReactNode } from '../../../core'
import { REACT_PORTAL_TYPE } from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  registerElementMarker,
  reconcileChildren,
  childrenToArray,
} from '../../reconcile'

function renderPortal(fiber: Fiber, _domParent: Node, _anchor: Node | null): void {
  const { children, container } = fiber.pp as {
    children: ReactNode
    container: Element
  }
  reconcileChildren(fiber, childrenToArray(children), container, null)
  fiber.mp = fiber.pp
}

registerElementMarker(REACT_PORTAL_TYPE)
registerTypeMatcher((type) => (type === REACT_PORTAL_TYPE ? FiberTag.Portal : null))
registerRenderer(FiberTag.Portal, renderPortal)

import { FiberTag, type Fiber, type ReactNode } from '../../../core'
import { REACT_FORWARD_REF_TYPE } from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  reconcileChildren,
  childrenToArray,
  isThenable,
  handleSuspended,
  handleErrorInRender,
  getForceRerenderingFiber,
} from '../../reconcile'
import { HOOK_BAILOUT, renderWithHooks } from '../../dispatcher'

function renderForwardRef(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const canBail = fiber === getForceRerenderingFiber() && fiber.pp === fiber.mp
  fiber.cx?.clear()
  const props = fiber.pp ?? {}
  const render = (fiber.type as any).render
  const ref = fiber.ref ?? (props.ref ?? null)

  let rendered: ReactNode | typeof HOOK_BAILOUT
  try {
    const { ref: _omit, ...rest } = props
    rendered = renderWithHooks(fiber, render, rest, ref, canBail)
  } catch (e: any) {
    if (isThenable(e)) {
      handleSuspended(fiber, e)
      return
    } else {
      handleErrorInRender(fiber, e)
      return
    }
  }

  if (rendered === HOOK_BAILOUT) return
  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.mp = props
}

registerTypeMatcher((_type, marker) =>
  marker === REACT_FORWARD_REF_TYPE ? FiberTag.ForwardRef : null,
)
registerRenderer(FiberTag.ForwardRef, renderForwardRef)

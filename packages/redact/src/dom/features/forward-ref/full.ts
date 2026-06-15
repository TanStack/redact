import { FiberTag, type Fiber, type ReactNode } from '../../../core'
import { ReactSharedInternals, REACT_FORWARD_REF_TYPE } from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  reconcileChildren,
  childrenToArray,
  isThenable,
  handleSuspended,
  handleErrorInRender,
} from '../../reconcile'
import { makeDispatcher } from '../../dispatcher'

function renderForwardRef(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const props = fiber.pp ?? {}
  const render = (fiber.type as any).render
  const ref = fiber.ref ?? (props.ref ?? null)

  const prevDispatcher = ReactSharedInternals.H
  const prevFiber = ReactSharedInternals.F
  const prevHook = ReactSharedInternals.K
  const prevIndex = ReactSharedInternals.I
  ReactSharedInternals.H = makeDispatcher()
  ReactSharedInternals.F = fiber
  ReactSharedInternals.K = null
  ReactSharedInternals.I = 0

  let rendered: ReactNode
  try {
    const { ref: _omit, ...rest } = props
    rendered = render(rest, ref)
  } catch (e: any) {
    if (isThenable(e)) {
      handleSuspended(fiber, e)
      rendered = null
    } else {
      handleErrorInRender(fiber, e)
      return
    }
  } finally {
    ReactSharedInternals.H = prevDispatcher
    ReactSharedInternals.F = prevFiber
    ReactSharedInternals.K = prevHook
    ReactSharedInternals.I = prevIndex
  }

  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.mp = props
}

registerTypeMatcher((_type, marker) =>
  marker === REACT_FORWARD_REF_TYPE ? FiberTag.ForwardRef : null,
)
registerRenderer(FiberTag.ForwardRef, renderForwardRef)

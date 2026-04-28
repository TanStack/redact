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
  const props = fiber.pendingProps ?? {}
  const render = (fiber.type as any).render
  const ref = fiber.ref ?? (props.ref ?? null)

  const prevDispatcher = ReactSharedInternals.H
  const prevFiber = ReactSharedInternals.currentFiber
  const prevHook = ReactSharedInternals.currentHook
  const prevIndex = ReactSharedInternals.hookIndex
  ReactSharedInternals.H = makeDispatcher()
  ReactSharedInternals.currentFiber = fiber
  ReactSharedInternals.currentHook = null
  ReactSharedInternals.hookIndex = 0

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
    ReactSharedInternals.currentFiber = prevFiber
    ReactSharedInternals.currentHook = prevHook
    ReactSharedInternals.hookIndex = prevIndex
  }

  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.memoizedProps = props
}

registerTypeMatcher((_type, marker) =>
  marker === REACT_FORWARD_REF_TYPE ? FiberTag.ForwardRef : null,
)
registerRenderer(FiberTag.ForwardRef, renderForwardRef)

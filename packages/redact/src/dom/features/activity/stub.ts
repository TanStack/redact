import { FiberTag, type Fiber } from '../../../core'
import { REACT_ACTIVITY_TYPE } from '../../../react/activity'
import { childrenToArray, reconcileChildren, registerRenderer, registerTypeMatcher } from '../../reconcile'

// Explicit small-preset downgrade: hidden children unmount instead of being
// retained. Showing them again creates fresh state, DOM, effects, and refs.
function renderActivity(fiber: Fiber, parent: Node, anchor: Node | null): void {
  const props = fiber.pp ?? {}
  reconcileChildren(fiber, props.mode === 'hidden' ? [] : childrenToArray(props.children), parent, anchor)
  fiber.mp = props
}

registerTypeMatcher(type => type === REACT_ACTIVITY_TYPE ? FiberTag.Activity : null)
registerRenderer(FiberTag.Activity, renderActivity)

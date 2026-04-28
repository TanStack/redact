import { FiberTag, type Fiber } from '../../../core'
import { REACT_LAZY_TYPE } from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  renderFiber,
  scheduleUpdate,
  isThenable,
  handleSuspended,
  getCurrentRoot,
} from '../../reconcile'
import {
  getHydrationCursor,
  setHydrationCursor,
  findHostParent as findHydrationHost,
} from '../hydration'

function renderLazy(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const { _payload, _init } = fiber.type as any
  let resolved: any
  try {
    resolved = _init(_payload)
  } catch (thenable: any) {
    if (isThenable(thenable)) {
      // During initial hydration, a lazy component inside an SSR-resolved
      // Suspense boundary needs special handling: the SSR DOM for its
      // resolved content is already in the page and our cursor is pointing
      // at it. A normal `handleSuspended` would schedule the lazy's later
      // re-render WITHOUT the hydration cursor — so when it eventually
      // resolves, we'd create a fresh DOM copy next to the SSR one (visible
      // as duplicate logos / buttons / sections inside the Suspense). Mirror
      // the pattern in renderFunction: preserve the in-scope cursor on this
      // fiber and flag it for deferred re-hydration, so rerenderFiber
      // restores `root.hydrating = true` and the resolved render adopts the
      // existing DOM instead of mounting a duplicate.
      const root = getCurrentRoot()
      if (root?.hydrating) {
        const hostParent = findHydrationHost(fiber)
        const inheritedCursor = getHydrationCursor(hostParent)
        if (inheritedCursor) {
          setHydrationCursor(fiber, inheritedCursor)
        }
        fiber.memoizedState = {
          ...(fiber.memoizedState ?? {}),
          _pendingHydration: true,
        }
        // Mark the nearest ancestor Suspense as "awaiting hydration-resume"
        // so a post-hydration re-render of that Suspense doesn't accidentally
        // flip into suspended+pending and mount a fallback atop the SSR
        // content. Match-by-tag-name works whether Suspense is the full
        // feature or stubbed to Fragment (the walk just never finds one).
        let sus: Fiber | null = fiber.parent
        while (sus && sus.tag !== FiberTag.Suspense) sus = sus.parent
        if (sus && sus.memoizedState) {
          ;(sus.memoizedState as any)._awaitingLazyHydration = true
        }
        thenable.then(
          () => {
            if (sus && sus.memoizedState) {
              ;(sus.memoizedState as any)._awaitingLazyHydration = false
            }
            scheduleUpdate(fiber)
          },
          () => {
            if (sus && sus.memoizedState) {
              ;(sus.memoizedState as any)._awaitingLazyHydration = false
            }
            scheduleUpdate(fiber)
          },
        )
        return
      }
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
registerRenderer(FiberTag.Lazy, renderLazy)

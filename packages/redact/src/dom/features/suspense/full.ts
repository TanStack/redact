import { FiberTag, type Fiber } from '../../../core'
import { REACT_SUSPENSE_TYPE } from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  installCapability,
  reconcileChildren,
  childrenToArray,
  scheduleUpdate,
  unmountAllChildren,
  findRoot,
  runEffects,
  getCurrentRoot,
  withCurrentRoot,
} from '../../reconcile'
import {
  HydrationCursor,
  setHydrationCursor,
  clearHydrationCursor,
  advanceCursorPast,
  tryConsumeBoundary,
} from '../hydration'

const suspendHandlerStack: Array<(t: Promise<any>) => void> = []

function realHandleSuspended(fiber: Fiber, thenable: Promise<any>): void {
  const handler = suspendHandlerStack[suspendHandlerStack.length - 1]
  if (handler) {
    handler(thenable)
    return
  }
  // Fallback: schedule re-render when promise settles
  thenable.then(
    () => scheduleUpdate(fiber),
    () => scheduleUpdate(fiber),
  )
}

function renderSuspense(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const props = fiber.pendingProps ?? {}
  const state = (fiber.memoizedState ??= { suspended: false, pending: null as Promise<any> | null })

  // Streaming hydration: if the next DOM node is a server-emitted boundary
  // marker, route through the boundary-aware hydration path.
  const root = getCurrentRoot()
  if (root?.hydrating && fiber.parent && !state.hydrated) {
    const boundary = tryConsumeBoundary(fiber.parent)
    if (boundary) {
      hydrateSuspenseBoundary(fiber, props, boundary, domParent, anchor)
      state.hydrated = true
      return
    }
  }

  // A descendant Lazy deferred its hydration (see renderLazy's hydrating
  // branch). Its SSR-rendered content is still in the DOM and cursor-bound
  // via the Lazy fiber — we just haven't swapped it into a fiber subtree
  // yet. Until the Lazy's resume fires, skip our own tryChildren pass so
  // an unrelated re-render can't accidentally flip us into the suspended
  // path and mount a duplicate fallback on top of the SSR content.
  if ((state as any)._awaitingLazyHydration) {
    fiber.memoizedProps = props
    return
  }

  const tryChildren = () => {
    reconcileChildren(fiber, childrenToArray(props.children), domParent, anchor)
  }

  if (state.suspended && state.pending) {
    // Render fallback while waiting; pending promise will reschedule
    reconcileChildren(fiber, childrenToArray(props.fallback), domParent, anchor)
    fiber.memoizedProps = props
    return
  }

  // Attempt children — suspension is handled by the pushed handler below
  const savedHandler = suspendHandlerStack[suspendHandlerStack.length - 1]
  suspendHandlerStack.push((thenable) => {
    state.suspended = true
    state.pending = thenable
    thenable.then(
      () => {
        state.suspended = false
        state.pending = null
        scheduleUpdate(fiber)
      },
      () => {
        state.suspended = false
        state.pending = null
        scheduleUpdate(fiber)
      },
    )
  })
  try {
    tryChildren()
  } finally {
    suspendHandlerStack.pop()
    void savedHandler
  }

  if (state.suspended) {
    // Replace children with fallback
    unmountAllChildren(fiber, domParent)
    reconcileChildren(fiber, childrenToArray(props.fallback), domParent, anchor)
  }
  fiber.memoizedProps = props
}

function hydrateSuspenseBoundary(
  fiber: Fiber,
  props: any,
  boundary: { kind: 'pending' | 'resolved'; id: number; startMark: Comment; endMark: Comment },
  domParent: Node,
  anchor: Node | null,
): void {
  const { kind, id, startMark, endMark } = boundary
  // Record the boundary shape so we can re-hydrate on reveal.
  fiber.memoizedState = {
    suspended: false,
    pending: null,
    hydrated: true,
    boundaryId: id,
    startMark,
    endMark,
    realChildren: props.children,
  }

  if (kind === 'resolved') {
    // Real DOM is inline between startMark and endMark. Hydrate into it.
    const cursor = new HydrationCursor(startMark.parentNode!, startMark.nextSibling, endMark)
    setHydrationCursor(fiber, cursor)
    reconcileChildren(fiber, childrenToArray(props.children), domParent, anchor)
    clearHydrationCursor(fiber)
    advanceCursorPast(fiber.parent!, endMark)
    fiber.memoizedProps = props
    return
  }

  // Pending: fallback DOM lives inside <div id="B:ID">. Hydrate the fallback
  // React subtree against that div's children.
  const bDiv = (document as Document).getElementById(`B:${id}`)
  if (bDiv) {
    const cursor = new HydrationCursor(bDiv)
    setHydrationCursor(fiber, cursor)
    reconcileChildren(fiber, childrenToArray(props.fallback), domParent, anchor)
    clearHydrationCursor(fiber)
  } else {
    // Couldn't find fallback container — render fresh (non-adopting)
    reconcileChildren(fiber, childrenToArray(props.fallback), domParent, anchor)
  }
  advanceCursorPast(fiber.parent!, endMark)

  // Register for server-streamed reveal (HTML chunks + $RC calls).
  const win = globalThis as any
  if (typeof win.$RH === 'function') {
    win.$RH(id, () => rehydrateBoundary(fiber))
  }
  // If the inline runtime isn't present, nothing external will mark us dirty.

  fiber.memoizedProps = props
}

function rehydrateBoundary(fiber: Fiber): void {
  const state = fiber.memoizedState
  if (!state || !state.startMark || !state.endMark) return

  const root = findRoot(fiber)
  if (!root) return
  const parent = state.startMark.parentNode as Node
  if (!parent) return

  // Unmount existing fallback subtree. Its DOM has already been removed by $RC
  // (or at least its container); unmounting here cleans up fibers + effects.
  withCurrentRoot(root, () => {
    unmountAllChildren(fiber, parent)

    // Re-hydrate with real children against the now-real DOM range.
    root.hydrating = true
    const cursor = new HydrationCursor(parent, state.startMark.nextSibling, state.endMark)
    setHydrationCursor(fiber, cursor)
    reconcileChildren(fiber, childrenToArray(state.realChildren), parent, null)
    clearHydrationCursor(fiber)
    root.hydrating = false
    runEffects(root)
  })
}

registerTypeMatcher((type) => (type === REACT_SUSPENSE_TYPE ? FiberTag.Suspense : null))
registerRenderer(FiberTag.Suspense, renderSuspense)
installCapability('handleSuspended', realHandleSuspended)

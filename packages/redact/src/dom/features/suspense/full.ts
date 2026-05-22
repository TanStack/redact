import { FiberTag, createFiber, type Fiber } from '../../../core'
import { REACT_SUSPENSE_TYPE } from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  installCapability,
  reconcileChildren,
  childrenToArray,
  renderFiber,
  scheduleUpdate,
  unmountAllChildren,
  unmountFiber,
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

// React's Suspense semantics: when a re-render of an already-committed
// boundary suspends, the previously-committed children are kept in the DOM
// (hidden) so their scroll position, focus, selection, native form state,
// and component state survive across the suspension. The fallback is mounted
// alongside the hidden primary until the pending promise resolves.
//
// We track the hidden subtree DOM in `state.hiddenDoms` (root host nodes +
// their original `display` so we can restore it) and the fallback as a
// detached Fragment fiber in `state.fallbackFiber` (deliberately kept OUT of
// `fiber.child` so reconciles against `props.children` don't trip on it).
// First-mount suspensions have no committed DOM worth preserving, so they
// keep the original unmount-and-render-fallback behavior.
interface SuspenseState {
  suspended: boolean
  pending: Promise<any> | null
  hydrated?: boolean
  boundaryId?: number
  startMark?: Comment
  endMark?: Comment
  realChildren?: any
  _awaitingLazyHydration?: boolean
  // Re-suspend preservation:
  hiddenDoms: Array<[HTMLElement, string]> | null
  fallbackFiber: Fiber | null
}

function renderSuspense(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const props = fiber.pendingProps ?? {}
  const state = (fiber.memoizedState ??= {
    suspended: false,
    pending: null as Promise<any> | null,
    hiddenDoms: null,
    fallbackFiber: null,
  }) as SuspenseState

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
  if (state._awaitingLazyHydration) {
    fiber.memoizedProps = props
    return
  }

  // We were already in the suspended-with-preserved-primary state. Don't
  // re-attempt primary children (would re-throw and churn the tree). Just
  // refresh the fallback in case its JSX changed, and wait for the pending
  // promise to fire scheduleUpdate.
  if (state.suspended && state.pending && state.fallbackFiber) {
    state.fallbackFiber.pendingProps = { children: props.fallback }
    renderFiber(state.fallbackFiber, domParent, anchor)
    fiber.memoizedProps = props
    return
  }

  // Initial-mount suspended path: no committed primary to preserve. Old
  // behavior — render fallback into fiber.child directly.
  if (state.suspended && state.pending && !state.fallbackFiber) {
    reconcileChildren(fiber, childrenToArray(props.fallback), domParent, anchor)
    fiber.memoizedProps = props
    return
  }

  // Snapshot whether we have an existing committed primary tree before
  // attempting the new render. If the new attempt suspends and we did have a
  // committed primary, we keep it (hidden) rather than destroying it.
  const hadCommittedPrimary = fiber.memoizedProps !== undefined && fiber.child !== null

  const savedHandler = suspendHandlerStack[suspendHandlerStack.length - 1]
  let suspendedThisRender = false
  let suspendedThenable: Promise<any> | null = null
  suspendHandlerStack.push((thenable) => {
    suspendedThisRender = true
    suspendedThenable = thenable
  })
  try {
    reconcileChildren(fiber, childrenToArray(props.children), domParent, anchor)
  } finally {
    suspendHandlerStack.pop()
    void savedHandler
  }

  if (suspendedThisRender && suspendedThenable) {
    state.suspended = true
    state.pending = suspendedThenable
    const onSettle = () => {
      state.suspended = false
      state.pending = null
      scheduleUpdate(fiber)
    }
    suspendedThenable.then(onSettle, onSettle)

    if (hadCommittedPrimary && fiber.child) {
      // Hide the primary subtree's root host doms so the fallback is the only
      // thing visible, but the underlying nodes (and their scroll/state/focus)
      // survive. Save original `display` for the resume path.
      const hostDoms: Node[] = []
      let c: Fiber | null = fiber.child
      while (c) {
        collectRootHostDoms(c, hostDoms)
        c = c.sibling
      }
      const hidden: Array<[HTMLElement, string]> = []
      for (const d of hostDoms) {
        if (d.nodeType === 1) {
          const el = d as HTMLElement
          hidden.push([el, el.style.display])
          el.style.display = 'none'
        }
      }
      state.hiddenDoms = hidden

      // Mount fallback in a detached Fragment fiber. Kept off `fiber.child`
      // so reconciles of primary don't see it as a stale match candidate.
      if (!state.fallbackFiber) {
        state.fallbackFiber = createFiber(FiberTag.Fragment, null, null)
        state.fallbackFiber.parent = fiber
      }
      state.fallbackFiber.pendingProps = { children: props.fallback }
      renderFiber(state.fallbackFiber, domParent, anchor)
    } else {
      // First-mount suspension — nothing to preserve.
      unmountAllChildren(fiber, domParent)
      reconcileChildren(fiber, childrenToArray(props.fallback), domParent, anchor)
    }
  } else {
    // Render succeeded. Clean up any preserved-suspend state from a prior
    // suspension cycle: unhide primary, unmount the orphan fallback fiber.
    if (state.hiddenDoms) {
      for (const [el, origDisplay] of state.hiddenDoms) {
        el.style.display = origDisplay
      }
      state.hiddenDoms = null
    }
    if (state.fallbackFiber) {
      unmountFiber(state.fallbackFiber, domParent)
      state.fallbackFiber = null
    }
  }
  fiber.memoizedProps = props
}

// Walk a fiber subtree collecting host/text DOM nodes that sit at the root
// of the subtree (do not descend through their children — display:none on
// the root hides the whole element). Used by the hide-on-suspend path.
function collectRootHostDoms(fiber: Fiber, out: Node[]): void {
  if (fiber.tag === FiberTag.Host || fiber.tag === FiberTag.Text) {
    if (fiber.dom) out.push(fiber.dom)
    return
  }
  if (fiber.tag === FiberTag.Portal) return
  let c = fiber.child
  while (c) {
    collectRootHostDoms(c, out)
    c = c.sibling
  }
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

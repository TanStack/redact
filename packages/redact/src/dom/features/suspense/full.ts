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
  discardPendingWork,
} from '../../reconcile'
import {
  HydrationCursor,
  setHydrationCursor,
  clearHydrationCursor,
  advanceCursorPast,
  tryConsumeBoundary,
  isHydrationBailout,
} from '../hydration'

let suspendHandler: ((t: Promise<any>) => void) | null = null

function realHandleSuspended(fiber: Fiber, thenable: Promise<any>): void {
  if (suspendHandler) return suspendHandler(thenable)
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
// We track the hidden subtree DOM in `state.d` (root host nodes +
// their original `display` so we can restore it) and the fallback as a
// detached Fragment fiber in `state.f` (deliberately kept OUT of
// `fiber.child` so reconciles against `props.children` don't trip on it).
// First-mount suspensions have no committed DOM worth preserving, so they
// keep the original unmount-and-render-fallback behavior.
interface SuspenseState {
  p?: Promise<any> | null
  b?: Comment
  e?: Comment
  r?: any
  a?: boolean
  // Re-suspend preservation:
  d?: Array<[HTMLElement, string]> | null
  f?: Fiber | null
}

function renderSuspense(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const props = fiber.pp ?? {}
  const state = (fiber.ms ??= {}) as SuspenseState

  // Streaming hydration: if the next DOM node is a server-emitted boundary
  // marker, route through the boundary-aware hydration path.
  const root = getCurrentRoot()
  if (root?.h && !state.b) {
    const boundary = tryConsumeBoundary(fiber.parent!)
    if (boundary) {
      hydrateSuspenseBoundary(fiber, props, boundary, domParent, anchor)
      return
    }
  }

  // A descendant Lazy deferred its hydration (see renderLazy's hydrating
  // branch). Its SSR-rendered content is still in the DOM and cursor-bound
  // via the Lazy fiber — we just haven't swapped it into a fiber subtree
  // yet. Until the Lazy's resume fires, skip our own tryChildren pass so
  // an unrelated re-render can't accidentally flip us into the suspended
  // path and mount a duplicate fallback on top of the SSR content.
  if (state.a) {
    fiber.mp = props
    return
  }

  // We were already in the suspended-with-preserved-primary state. Don't
  // re-attempt primary children (would re-throw and churn the tree). Just
  // refresh the fallback in case its JSX changed, and wait for the pending
  // promise to fire scheduleUpdate.
  if (state.p) {
    if (state.f) {
      state.f.pp = { children: props.fallback }
      renderFiber(state.f, domParent, anchor)
    } else {
      // Initial-mount suspended path: no committed primary to preserve.
      reconcileChildren(fiber, childrenToArray(props.fallback), domParent, anchor)
    }
    fiber.mp = props
    return
  }

  // Snapshot whether we have an existing committed primary tree before
  // attempting the new render. If the new attempt suspends and we did have a
  // committed primary, we keep it (hidden) rather than destroying it.
  const hadCommittedPrimary = fiber.mp && fiber.child

  const prevHandler = suspendHandler
  let pendingThenable: any
  suspendHandler = (thenable) => {
    pendingThenable = thenable
  }
  try {
    reconcileChildren(fiber, childrenToArray(props.children), domParent, anchor)
  } finally {
    suspendHandler = prevHandler
  }

  if (pendingThenable) {
    state.p = pendingThenable
    const onSettle = () => {
      state.p = null
      scheduleUpdate(fiber)
    }
    pendingThenable.then(onSettle, onSettle)

    if (hadCommittedPrimary) {
      // Hide the primary subtree's root host doms so the fallback is the only
      // thing visible, but the underlying nodes (and their scroll/state/focus)
      // survive. Save original `display` for the resume path.
      const hidden: Array<[HTMLElement, string]> = []
      let c: Fiber | null = hadCommittedPrimary
      while (c) {
        hideRootHostDoms(c, hidden)
        c = c.sibling
      }
      state.d = hidden

      // Mount fallback in a detached Fragment fiber. Kept off `fiber.child`
      // so reconciles of primary don't see it as a stale match candidate.
      if (!state.f) {
        state.f = createFiber(FiberTag.Fragment, null, null)
        state.f.parent = fiber
      }
      state.f.pp = { children: props.fallback }
      renderFiber(state.f, domParent, anchor)
    } else {
      // First-mount suspension — nothing to preserve.
      unmountAllChildren(fiber, domParent)
      reconcileChildren(fiber, childrenToArray(props.fallback), domParent, anchor)
    }
  } else {
    // Render succeeded. Clean up any preserved-suspend state from a prior
    // suspension cycle: unhide primary, unmount the orphan fallback fiber.
    if (state.d) {
      for (const [el, origDisplay] of state.d) {
        el.style.display = origDisplay
      }
      state.d = null
    }
    if (state.f) {
      unmountFiber(state.f, domParent)
      state.f = null
    }
  }
  fiber.mp = props
}

// Walk a fiber subtree collecting host/text DOM nodes that sit at the root
// of the subtree (do not descend through their children — display:none on
// the root hides the whole element). Used by the hide-on-suspend path.
function hideRootHostDoms(fiber: Fiber, out: Array<[HTMLElement, string]>): void {
  if (fiber.tag === FiberTag.Host) {
    const el = fiber.dom as HTMLElement
    out.push([el, el.style.display])
    el.style.display = 'none'
    return
  }
  if (fiber.tag === FiberTag.Portal) return
  let c = fiber.child
  while (c) {
    hideRootHostDoms(c, out)
    c = c.sibling
  }
}

function hydrateSuspenseBoundary(
  fiber: Fiber,
  props: any,
  boundary: [0 | 1, number, Comment, Comment],
  domParent: Node,
  anchor: Node | null,
): void {
  const [pendingBoundary, id, startMark, endMark] = boundary
  // Record the boundary shape so we can re-hydrate on reveal.
  fiber.ms = {
    b: startMark,
    e: endMark,
    r: props.children,
  }

  if (!pendingBoundary) {
    // Real DOM is inline between startMark and endMark. Hydrate into it.
    const parent = startMark.parentNode!
    try {
      setHydrationCursor(fiber, new HydrationCursor(parent, startMark.nextSibling, endMark))
      reconcileChildren(fiber, childrenToArray(props.children), domParent, anchor)
      advanceCursorPast(fiber.parent!, endMark)
    } catch (e) {
      if (!isHydrationBailout(e)) {
        clearBoundaryRange(startMark, endMark)
        unmountAllChildren(fiber, parent)
        throw e
      }
      recoverBoundaryHydration(fiber, props.children, parent, startMark, endMark)
    } finally {
      clearHydrationCursor(fiber)
    }
    fiber.mp = props
    return
  }

  // Pending: fallback DOM lives inside <div id="B:ID">. Hydrate the fallback
  // React subtree against that div's children.
  const bDiv = document.getElementById(`B:${id}`)
  try {
    if (bDiv) {
      setHydrationCursor(fiber, new HydrationCursor(bDiv))
      reconcileChildren(fiber, childrenToArray(props.fallback), domParent, anchor)
    } else {
      // Couldn't find fallback container — render fresh (non-adopting)
      reconcileChildren(fiber, childrenToArray(props.fallback), domParent, anchor)
    }
  } catch (e) {
    if (!isHydrationBailout(e) || !bDiv) throw e
    recoverFallbackHydration(fiber, props.fallback, bDiv)
  } finally {
    clearHydrationCursor(fiber)
  }
  advanceCursorPast(fiber.parent!, endMark)

  // Register for server-streamed reveal (HTML chunks + $RC calls).
  ;(globalThis as any).$RH?.(id, () => rehydrateBoundary(fiber))
  // If the inline runtime isn't present, nothing external will mark us dy.

  fiber.mp = props
}

function recoverBoundaryHydration(
  fiber: Fiber,
  children: any,
  parent: Node,
  startMark: Comment,
  endMark: Comment,
): void {
  const root = findRoot(fiber)!
  const prevHydrating = root.h
  discardPendingWork(root)
  clearBoundaryRange(startMark, endMark)
  unmountAllChildren(fiber, parent)
  root.h = false
  try {
    reconcileChildren(fiber, childrenToArray(children), parent, endMark)
    advanceCursorPast(fiber.parent!, endMark)
  } catch (clientError) {
    clearBoundaryRange(startMark, endMark)
    unmountAllChildren(fiber, parent)
    throw clientError
  } finally {
    root.h = prevHydrating
  }
}

function recoverFallbackHydration(fiber: Fiber, fallback: any, parent: HTMLElement): void {
  const root = findRoot(fiber)!
  const prevHydrating = root.h
  discardPendingWork(root)
  parent.textContent = ''
  unmountAllChildren(fiber, parent)
  root.h = false
  try {
    reconcileChildren(fiber, childrenToArray(fallback), parent, null)
  } catch (clientError) {
    parent.textContent = ''
    unmountAllChildren(fiber, parent)
    throw clientError
  } finally {
    root.h = prevHydrating
  }
}

function rehydrateBoundary(fiber: Fiber): void {
  const state = fiber.ms
  if (!state?.b || !state.e) return

  const root = findRoot(fiber)
  const parent = state.b.parentNode as Node
  if (!(root && parent)) return

  // Unmount existing fallback subtree. Its DOM has already been removed by $RC
  // (or at least its container); unmounting here cleans up fibers + fx.
  withCurrentRoot(root, () => {
    const prevHydrating = root.h
    try {
      unmountAllChildren(fiber, parent)

      // Re-hydrate with real children against the now-real DOM range.
      root.h = true
      setHydrationCursor(fiber, new HydrationCursor(parent, state.b.nextSibling, state.e))
      reconcileChildren(fiber, childrenToArray(state.r), parent, null)
    } catch (e) {
      if (!isHydrationBailout(e)) {
        clearBoundaryRange(state.b, state.e)
        unmountAllChildren(fiber, parent)
        throw e
      }

      recoverBoundaryHydration(fiber, state.r, parent, state.b, state.e)
    } finally {
      root.h = prevHydrating
      clearHydrationCursor(fiber)
    }
    runEffects(root)
  })
}

function clearBoundaryRange(startMark: Comment, endMark: Comment): void {
  let node = startMark.nextSibling
  while (node && node !== endMark) {
    const next = node.nextSibling
    node.parentNode?.removeChild(node)
    node = next
  }
}

registerTypeMatcher((type) => (type === REACT_SUSPENSE_TYPE ? FiberTag.Suspense : null))
registerRenderer(FiberTag.Suspense, renderSuspense)
installCapability('handleSuspended', realHandleSuspended)

import { FiberTag, createFiber, type Fiber } from '../../../core'
import { REACT_SUSPENSE_TYPE, ReactSharedInternals, startTransition } from '../../../react'
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
  findSuspenseBoundary,
  RenderSuspenseCapture,
  activityIsDisconnected,
  isActivityHidden,
  attachRef,
  detachRef,
  enqueueEffect,
  flushFiberCommits,
  scheduleLifecycle,
  handleCommitError,
} from '../../reconcile'
import { cleanupEffect } from '../../dispatcher'
import { retainedEffects, inSuspensePrimary, setLayoutDisconnected, walkRetained } from '../../retained-effects'
import {
  HydrationCursor,
  setHydrationCursor,
  clearHydrationCursor,
  advanceCursorPast,
  tryConsumeBoundary,
  isHydrationBailout,
} from '../hydration'
import { hasContextChanged, renderContextConsumers } from '../context'
import { checkpointCommit, rewindCommit, queueMutation, onCommitFailure } from '../../commit'

let suspendHandler: ((t: Promise<any>) => void) | null = null

function scheduleRetry(fiber: Fiber): void {
  const previous = ReactSharedInternals.T
  ReactSharedInternals.T = null
  try { startTransition(() => scheduleUpdate(fiber)) } finally { ReactSharedInternals.T = previous }
}

function realHandleSuspended(fiber: Fiber, thenable: Promise<any>): void {
  if (suspendHandler) return suspendHandler(thenable)
  const boundary = findSuspenseBoundary(fiber)
  if (boundary) throw new RenderSuspenseCapture(boundary)
  // Fallback: schedule re-render when promise settles
  thenable.then(
    () => scheduleRetry(fiber),
    () => scheduleRetry(fiber),
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
// First-mount suspensions discard the failed primary but retain a separate
// fallback fiber so unsuccessful retries preserve its state and DOM.
interface SuspenseState {
  p?: Promise<any> | null
  b?: Comment
  e?: Comment
  r?: any
  a?: boolean
  u?: boolean
  // Re-suspend preservation:
  d?: Array<[HTMLElement, string]> | null
  f?: Fiber | null
}

function renderSuspense(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const props = fiber.pp ?? {}
  let state = (fiber.ms ??= {}) as SuspenseState

  // Streaming hydration: if the next DOM node is a server-emitted boundary
  // marker, route through the boundary-aware hydration path.
  const root = getCurrentRoot()
  if (root) root.sp = true
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

  // New primary children or context can unblock a boundary before its old
  // promise settles. A fallback-only update can keep the pending primary.
  if (state.p && !state.u && props.children === fiber.mp?.children && !hasContextChanged(fiber, false)) {
    if (state.f) {
      renderFallback(state.f, props.fallback, domParent, anchor)
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
  state.u = false
  const checkpoint = checkpointCommit(fiber)

  const prevHandler = suspendHandler
  fiber.cx?.clear()
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
    rewindCommit(checkpoint)
    state = (fiber.ms ??= {}) as SuspenseState
    const previousThenable = state.p
    state.p = pendingThenable
    const onSettle = () => {
      const current = fiber.ms as SuspenseState | null
      if (!current || current.p !== pendingThenable) return
      current.p = null
      scheduleRetry(fiber)
    }
    if (previousThenable !== pendingThenable) pendingThenable.then(onSettle, onSettle)

    // Rewind restored the committed tree, including its existing hidden state.
    // Only the first hide needs update-target, lifecycle and DOM work.
    if (hadCommittedPrimary && !state.d) {
      // Hide the primary subtree's root host doms so the fallback is the only
      // thing visible, but the underlying nodes (and their scroll/state/focus)
      // survive. Save original `display` for the resume path.
      const hidden: Array<[HTMLElement, string]> = []
      let c: Fiber | null = hadCommittedPrimary
      while (c) {
        setUpdateBoundary(c, fiber)
        walkRetained(c, disconnectLayout)
        c = c.sibling
      }
      c = hadCommittedPrimary
      while (c) {
        hideRootHostDoms(c, hidden)
        c = c.sibling
      }
      state.d = hidden

    } else if (!hadCommittedPrimary) {
      // First-mount suspension — nothing to preserve.
      unmountAllChildren(fiber, domParent)
    }
    // Keep fallback identity across unsuccessful retries of an initial mount.
    if (!state.f) {
      state.f = createFiber(FiberTag.Fragment, null, null)
      state.f.parent = fiber
    }
    renderFallback(state.f, props.fallback, domParent, anchor)
  } else {
    state.p = null
    fiber.cx?.clear()
    const wasHidden = !!state.d
    // Render succeeded. Clean up any preserved-suspend state from a prior
    // suspension cycle: unhide primary, unmount the orphan fallback fiber.
    if (state.d) {
      for (let child = fiber.child; child; child = child.sibling) setUpdateBoundary(child, fiber.su)
      const hidden = state.d
      queueMutation(() => {
        for (const [el, origDisplay] of hidden) el.style.display = origDisplay
      })
      state.d = null
    }
    if (state.f) {
      unmountFiber(state.f, domParent)
      state.f = null
    }
    if (wasHidden) for (let child = fiber.child; child; child = child.sibling) walkRetained(child, reconnectLayout, true)
  }
  fiber.mp = props
}

function renderFallback(fiber: Fiber, children: any, domParent: Node, anchor: Node | null): void {
  // Local updates remain independently queued, unless an outer hidden primary
  // owns them. Context must still cross an otherwise unchanged fallback.
  if (fiber.mp && fiber.mp.children === children && !fiber.su) renderContextConsumers(fiber)
  else {
    fiber.pp = { children }
    renderFiber(fiber, domParent, anchor)
  }
}

function disconnectLayout(fiber: Fiber): void {
  if (setLayoutDisconnected(fiber, true) || activityIsDisconnected(fiber)) return
  queueMutation(() => {
    for (const [hook, effect] of retainedEffects.get(fiber) ?? []) {
      if (effect.t === 1 && !effect.s) cleanupEffect(hook, fiber)
    }
    const cleanup = fiber.rc
    fiber.rc = null
    if (cleanup) {
      const index = fiber.cu?.indexOf(cleanup) ?? -1
      if (index >= 0) fiber.cu!.splice(index, 1)
      try { cleanup() } catch (error) { handleCommitError(fiber, error) }
    }
    detachRef(fiber.cr ?? fiber.ref, fiber)
    fiber.cr = null
    const instance = fiber.sn?._fiber === fiber ? fiber.sn : null
    if (instance?.componentWillUnmount) {
      const props = instance.props, state = instance.state, committed = fiber.ms?.c
      if (committed) { instance.props = committed.props; instance.state = committed.state }
      try { instance.componentWillUnmount() } catch (error) { handleCommitError(fiber, error) }
      finally { instance.props = props; instance.state = state }
    }
  })
}

function reconnectLayout(fiber: Fiber): void {
  if (!fiber.ld || isActivityHidden(fiber) || activityIsDisconnected(fiber)) return
  if (inSuspensePrimary(fiber)) return
  setLayoutDisconnected(fiber, false)
  const instance = fiber.sn?._fiber === fiber ? fiber.sn : null
  if (fiber.tag === FiberTag.Host || fiber.tag === FiberTag.Resource) attachRef(fiber, fiber.dom)
  else if (instance || fiber.tag === FiberTag.Fragment) attachRef(fiber, fiber.sn)
  for (const effect of retainedEffects.get(fiber)?.values() ?? []) {
    if (effect.t === 1 && !effect.s) enqueueEffect(fiber, effect)
  }
  if (instance?.componentDidMount) scheduleLifecycle(fiber, () => instance.componentDidMount())
  flushFiberCommits(fiber)
}

function setUpdateBoundary(fiber: Fiber, boundary: Fiber | null | undefined): void {
  fiber.su = boundary ?? null
  const primary = fiber.tag === FiberTag.Suspense && fiber.ms?.p ? fiber : boundary
  for (let child = fiber.child; child; child = child.sibling) setUpdateBoundary(child, primary)
  if (fiber.tag === FiberTag.Suspense && fiber.ms?.f) setUpdateBoundary(fiber.ms.f, boundary)
}

// Walk a fiber subtree collecting host/text DOM nodes that sit at the root
// of the subtree (do not descend through their children — display:none on
// the root hides the whole element). Used by the hide-on-suspend path.
function hideRootHostDoms(fiber: Fiber, out: Array<[HTMLElement, string]>): void {
  if (fiber.tag === FiberTag.Host) {
    const el = fiber.dom as HTMLElement
    const existing = out.find(([node]) => node === el)
    const entry: [HTMLElement, string] = existing ?? [el, el.style.display]
    if (!existing) out.push(entry)
    const display = fiber.pp?.style?.display
    queueMutation(() => {
      // Earlier Activity or host updates in this commit can change display.
      if (!existing || el.style.display !== 'none' || display === 'none') entry[1] = el.style.display
      el.style.display = 'none'
    })
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
  boundary: [0 | 1 | 2 | 3, number, Comment, Comment],
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

  if (pendingBoundary >= 2) {
    if (pendingBoundary === 3) reportServerFailure(fiber)
    recoverBoundaryHydration(fiber, props.children, startMark.parentNode!, startMark, endMark, true)
    fiber.mp = props
    return
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
        onCommitFailure(() => {
          clearBoundaryRange(startMark, endMark)
          unmountAllChildren(fiber, parent)
        })
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
  retryBoundary = false,
): void {
  const root = findRoot(fiber)!
  const prevHydrating = root.h
  if (!retryBoundary) discardPendingWork(root)
  clearBoundaryRange(startMark, endMark)
  unmountAllChildren(fiber, parent)
  root.h = false
  try {
    if (retryBoundary) {
      fiber.ms = {}
      renderSuspense(fiber, parent, endMark)
    } else reconcileChildren(fiber, childrenToArray(children), parent, endMark)
    advanceCursorPast(fiber.parent!, endMark)
  } catch (clientError) {
    onCommitFailure(() => {
      clearBoundaryRange(startMark, endMark)
      unmountAllChildren(fiber, parent)
    })
    throw clientError
  } finally {
    root.h = prevHydrating
  }
}

function recoverFallbackHydration(fiber: Fiber, fallback: any, parent: HTMLElement): void {
  const root = findRoot(fiber)!
  const prevHydrating = root.h
  discardPendingWork(root)
  queueMutation(() => { parent.textContent = '' })
  unmountAllChildren(fiber, parent)
  root.h = false
  try {
    reconcileChildren(fiber, childrenToArray(fallback), parent, null)
  } catch (clientError) {
    onCommitFailure(() => {
      parent.textContent = ''
      unmountAllChildren(fiber, parent)
    })
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
    if (state.b.data.startsWith('$!') || state.b.data.startsWith('$E')) {
      if (state.b.data.startsWith('$E')) reportServerFailure(fiber)
      recoverBoundaryHydration(fiber, state.r, parent, state.b, state.e, true)
      runEffects(root)
      return
    }
    try {
      unmountAllChildren(fiber, parent)

      // Re-hydrate with real children against the now-real DOM range.
      root.h = true
      setHydrationCursor(fiber, new HydrationCursor(parent, state.b.nextSibling, state.e))
      reconcileChildren(fiber, childrenToArray(state.r), parent, null)
    } catch (e) {
      if (!isHydrationBailout(e)) {
        onCommitFailure(() => {
          clearBoundaryRange(state.b, state.e)
          unmountAllChildren(fiber, parent)
        })
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

function reportServerFailure(fiber: Fiber): void {
  const error = new Error('Switched to client rendering because the server render did not complete.')
  const handler = findRoot(fiber)?.re
  if (handler) handler(error, { componentStack: null })
  else console.error(error)
}

function clearBoundaryRange(startMark: Comment, endMark: Comment): void {
  queueMutation(() => {
    let node = startMark.nextSibling
    while (node && node !== endMark) {
      const next = node.nextSibling
      node.parentNode?.removeChild(node)
      node = next
    }
  })
}

registerTypeMatcher((type) => (type === REACT_SUSPENSE_TYPE ? FiberTag.Suspense : null))
registerRenderer(FiberTag.Suspense, renderSuspense)
installCapability('handleSuspended', realHandleSuspended)

import {
  FiberTag,
  createFiber,
  REACT_ELEMENT_TYPE,
  REACT_LEGACY_ELEMENT_TYPE,
  REACT_FRAGMENT_TYPE,
  type Fiber,
  type FiberRoot,
  type ReactElement,
  type ReactNode,
  type Effect,
  type Hook,
} from '../core'
import {
  ReactSharedInternals,
  REACT_LAZY_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_PROFILER_TYPE,
  REACT_VIEW_TRANSITION_TYPE,
} from '../react'
import { createHostNode, setProp, syncInputValue, syncTextareaValue } from './dom'
import { HOOK_BAILOUT, renderWithHooks } from './dispatcher'
import { rememberRetainedEffect, setLayoutDisconnected } from './retained-effects'
import { componentStack } from './error-info'
import { resourceKind } from '../core/resource-hints'
import { acquireResource } from './resources'
import { currentCommit, commitSynchronously, queueMutation, queueText, queueCommitEffects, setCommitCheckpointHook, onCommitRollback, onCommitFailure, checkpointCommit, rewindCommit, rememberChildList } from './commit'
import { markTransitionUpdate, deferTransition, cancelTransitions, deferTransitionLayout, deferTransitionPassive } from './features/view-transition'
import { createFragmentInstance, updateFragmentHost, refreshFragmentInstances } from './features/fragment-refs'
import {
  adoptHostDom,
  adoptTextDom,
  setHydrationCursor,
  getHydrationCursor,
  clearHydrationCursor,
  findHostParent as findHydrationHost,
  abortHydration,
  recoverHydration,
  isHydrationBailout,
} from './features/hydration'

// ---------------------------------------------------------------------------
// Render scheduling
// ---------------------------------------------------------------------------

let currentRoot: FiberRoot | null = null
let preparedParent: Node | null = null
let flushing = false
let isBatching = false
const pendingRoots = new Set<FiberRoot>()

// Set by rerenderFiber to identify the exact memo-tagged fiber whose INTERNAL
// state (hook update, useSyncExternalStore notification) triggered this render
// pass. renderMemo checks this to bypass its prop-equality gate for that fiber.
// Without the bypass, a memo bail would swallow state changes: React's memo is
// only a parent-triggered gate — state-driven rerenders must always run the
// inner function. Router-adjacent components (Outlet, Match, MatchInner) are
// all memo-wrapped and subscribe to stores; missing this bypass breaks nav
// content updates even though the URL changes.
let forceRerenderingFiber: Fiber | null = null

export function scheduleUpdate(fiber: Fiber): void {
  // Drop updates scheduled on already-um fibers. Subscribers (router,
  // query, any external store) can fire after unmount if their cleanup was
  // missed, and letting those reach rerenderFiber mounts zombie DOM into the
  // old .parent's DOM (which stays reachable via the stale pointer).
  if (fiber.um || fiber.pd) return
  fiber.dy = true
  // A component finishes its render-phase updates before reconciling children.
  if (ReactSharedInternals.F === fiber) return
  const root = findRoot(fiber)
  if (!root) return
  // Retained Suspense primaries must retry their boundary, not commit a child
  // against the older props preserved by the failed attempt.
  while (fiber.su) {
    fiber = fiber.su
    fiber.ms.u = true
    fiber.dy = true
  }
  markTransitionUpdate(root)
  root.p.add(fiber)
  pendingRoots.add(root)
  if (isBatching) return
  if (!root.s) {
    root.s = true
    queueMicrotask(flushPending)
  }
}

export function flushSyncWork(fn: () => void): void {
  cancelTransitions()
  const transition = ReactSharedInternals.T
  ReactSharedInternals.T = null
  const wasBatching = isBatching
  isBatching = true
  try {
    fn()
    isBatching = wasBatching
    flushPending()
  } finally {
    isBatching = wasBatching
    ReactSharedInternals.T = transition
  }
}

export function batchedUpdates<T>(fn: () => T): T {
  const wasBatching = isBatching
  isBatching = true
  try {
    return fn()
  } finally {
    isBatching = wasBatching
    if (!wasBatching) flushPending()
  }
}

function flushPending(): void {
  if (flushing) return
  flushing = true
  try {
    let guard = 0
    while (pendingRoots.size > 0) {
      if (++guard > 50) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error('flushPending exceeded 50 iterations — suspected infinite update loop.')
        }
        throw new Error()
      }
      const roots = [...pendingRoots]
      pendingRoots.clear()
      for (const root of roots) {
        root.s = false
        const render = () => flushRoot(root)
        if (!deferTransition(root, render, flushPending)) {
          try { commitSynchronously(render) }
          catch (error) { if (!recoverRootError(error)) throw error }
        }
      }
    }
  } finally {
    flushing = false
  }
}

function flushRoot(root: FiberRoot): void {
  if (root.er) {
    flushRootErrors(root)
    return
  }
  const render = root.u
  root.u = undefined
  if (render) render()
  // Ancestors run first, but keep descendants in the queue: an ancestor can
  // bail out without reaching a descendant's independently scheduled update.
  const pending = [...root.p]
  root.p.clear()
  pending.sort((a, b) => fiberDepth(a) - fiberDepth(b))
  for (const fiber of pending) {
    if (!fiber.dy || fiber.um || fiber.pd) continue
    const boundary = root.eb && findErrorBoundary(fiber)
    const checkpoint = boundary || (root.sp && findSuspenseBoundary(fiber)) ? checkpointCommit(fiber) : -1
    try {
      rerenderFiber(fiber, root)
    } catch (error) {
      if (error instanceof RenderSuspenseCapture) {
        rewindCommit(checkpoint)
        error.boundary.ms.u = true
        scheduleUpdate(error.boundary)
        continue
      }
      if (error instanceof RenderErrorCapture) {
        if (error.boundary.tag === FiberTag.Root) throw error
        rewindCommit(checkpoint)
        captureError(error)
        continue
      }
      if (!recoverHydration(root, error)) throw error
      break
    }
  }
  runEffects(root)
}

export function scheduleRootRender(root: FiberRoot, render: () => void): void {
  markTransitionUpdate(root)
  root.u = render
  pendingRoots.add(root)
  if (isBatching) return
  flushPending()
}

export function discardPendingWork(root: FiberRoot): void {
  root.u = undefined
  root.p.clear()
  root.s = false
  pendingRoots.delete(root)
}

export function discardPendingEffects(root: FiberRoot): void {
  for (const queue of [pendingEffects, pendingInsertionEffects, pendingCommits]) {
    for (let index = queue.length - 1; index >= 0; index--) {
      if (findRoot(queue[index]![0]) === root) removePendingEffect(queue, index)
    }
  }
  for (const fiber of stagedCommits.keys()) {
    if (findRoot(fiber) === root) removeStagedCommits(fiber)
  }
}

function fiberDepth(fiber: Fiber): number {
  // Reused fibers keep their parent and root, including keyed sibling moves.
  return fiber.depth ??= fiber.parent ? fiberDepth(fiber.parent) + 1 : 0
}

export function findRoot(fiber: Fiber): FiberRoot | null {
  let f: Fiber | null = fiber
  while (f) {
    if (f.root) return fiber.root = f.root
    f = f.parent
  }
  return null
}

// ---------------------------------------------------------------------------
// Entry points (called by createRoot)
// ---------------------------------------------------------------------------

export function renderRoot(root: FiberRoot, children: ReactNode): void {
  if (!currentCommit) return commitSynchronously(() => renderRoot(root, children))
  const rootFiber = root.r
  rootFiber.pp = { children }
  currentRoot = root
  try {
    reconcileChildren(rootFiber, childrenToArray(children), root.c as Node, null)
    rootFiber.mp = rootFiber.pp
    rootFiber.dy = false
  } finally {
    currentRoot = null
  }
  runEffects(root)
}

function rerenderFiber(fiber: Fiber, root: FiberRoot): void {
  if (!fiber.dy) return
  // Skip fibers that were um between scheduling and flush. Without this,
  // the flush loop re-enters a zombie fiber whose .parent is still set; its
  // render mounts fresh DOM into the old parent's still-attached DOM (since
  // unmountFiber only clears fiber.child, not fiber.parent). Visible as route
  // content from a previous location staying on screen after nav, because a
  // pending rerender on the old route's LibraryLandingPage (um during
  // Outlet's shallow-first render) still fires from root.pending.
  if (fiber.um || fiber.pd) return
  // Clear BEFORE rendering so a scheduleUpdate() triggered mid-render (e.g.
  // error boundary catching a descendant throw) marks us dy for the next
  // flush iteration instead of being wiped out when render() completes.
  fiber.dy = false
  currentRoot = root
  // If this rerender is resuming a hydration that was deferred by a suspension,
  // re-activate hydration mode for its duration so descendants adopt DOM
  // instead of re-creating it.
  const resumeHydration =
    fiber.ms && (fiber.ms as any).p === true
  const prevHydrating = root.h
  if (resumeHydration) {
    delete (fiber.ms as any).p
    root.h = true
  }
  const prevForcing = forceRerenderingFiber
  forceRerenderingFiber = fiber
  try {
    const domParent = getHostParent(fiber)
    renderFiber(fiber, domParent, getAnchor(fiber, domParent))
  } finally {
    forceRerenderingFiber = prevForcing
    if (resumeHydration) {
      root.h = prevHydrating
      // Deferred hydration completed — detach the preserved cursor so future
      // updates (post-hydration state changes) don't try to adopt stale DOM.
      clearHydrationCursor(fiber)
    }
    currentRoot = null
  }
}

// ---------------------------------------------------------------------------
// Element → children normalization
// ---------------------------------------------------------------------------

// Text children pass through as raw strings — no wrapper. The previous
// `{_text: string}` shape allocated tens of thousands of objects per
// stable-list re-render and dominated minor-GC pressure. `typeof === 'string'`
// is also robust to RSC renderable proxies (which have `has` traps that
// would fool a `'_text' in child` predicate but can't fool `typeof`).
type NormalizedChild = ReactElement | string | null

function isTextChild(child: Exclude<NormalizedChild, null>): child is string {
  return typeof child === 'string'
}

export function childrenToArray(children: ReactNode): NormalizedChild[] {
  const out: NormalizedChild[] = []
  pushChildren(children, out)
  return out
}

function pushChildren(node: ReactNode, out: NormalizedChild[]): void {
  if (node == null || typeof node === 'boolean') return
  if (typeof node === 'string') {
    // Empty strings render no text node (matches React + the `<!-- -->`
    // separator elision on the SSR side so server/client agree).
    if (node === '') return
    out.push(node)
    return
  }
  if (typeof node === 'number') {
    out.push('' + node)
    return
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) pushChildren(node[i], out)
    return
  }
  if (typeof node === 'object') {
    const t = (node as any).$$typeof
    if (ACCEPTED_ELEMENT_MARKERS.has(t)) {
      out.push(node as ReactElement)
      return
    }
    // Raw React.lazy as a child. RSC Flight encodes 'use client' components
    // (CodeBlock, CodeExplorer, etc.) as bare Lazy objects in the tree, not
    // wrapped in REACT_ELEMENT_TYPE. Dropping them made code snippets
    // disappear from docs pages. The RSC decoder pre-awaits payloads via
    // `awaitLazyElements`, so by render time the status is 'fulfilled' and
    // `_init()` returns the resolved element synchronously.
    if (t === REACT_LAZY_TYPE) {
      const lazy = node as any
      const resolved = lazy._init(lazy._payload)
      pushChildren(resolved, out)
      return
    }
  }
  if (isIterable(node)) {
    for (const item of node as Iterable<ReactNode>) pushChildren(item, out)
  }
}

function isIterable(obj: any): boolean {
  return obj != null && typeof obj[Symbol.iterator] == 'function'
}

function getKeyOf(child: NormalizedChild, index: number): string {
  if (!child) return 'n' + index
  if (isTextChild(child)) return '$t' + index
  if (child.key != null) return 'k' + child.key
  return 'i' + index
}

function sameType(fiber: Fiber, child: NormalizedChild): boolean {
  if (!child) return false
  if (isTextChild(child)) return fiber.tag === FiberTag.Text
  return fiber.type === child.type && sameKey(fiber.key, child.key)
}

function sameKey(a: string | null, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null)
}

// ---------------------------------------------------------------------------
// Fiber creation
// ---------------------------------------------------------------------------

function fiberFromChild(child: NormalizedChild, parent: Fiber): Fiber {
  if (!child) return createFiber(FiberTag.Fragment, null, null)
  if (isTextChild(child)) {
    const f = createFiber(FiberTag.Text, null, null)
    f.pp = child
    f.parent = parent
    return f
  }
  const type = child.type
  let tag: FiberTag = FiberTag.Host
  const marker = type && (type as any).$$typeof
  if (typeof type === 'string') tag = FiberTag.Host
  else if (type === REACT_FRAGMENT_TYPE) tag = FiberTag.Fragment
  else if (type === REACT_STRICT_MODE_TYPE || type === REACT_PROFILER_TYPE || type === REACT_VIEW_TRANSITION_TYPE) tag = FiberTag.Fragment
  else {
    // Feature-registered type matchers (Portal, future extractions). Features
    // that carry the symbol as element.type directly (rather than wrapping in
    // REACT_ELEMENT_TYPE) match here by type identity.
    let matched: FiberTag | null = null
    for (const m of TYPE_MATCHERS) {
      matched = m(type, marker)
      if (matched !== null) break
    }
    if (matched !== null) tag = matched
    else if (typeof type == 'function') {
      tag = type.prototype && type.prototype.isReactComponent ? FiberTag.Class : FiberTag.Function
    }
  }
  const f = createFiber(tag, type, child.key ?? null)
  f.ref = (child as any).ref ?? null
  f.pp = child.props
  f.parent = parent
  return f
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Reconcile a parent fiber's child list against new normalized children.
 * Mutates parent.child and the sibling chain.
 * Mounts new host DOM into `domParent` before `anchor` (or appends if anchor === null).
 */
export function reconcileChildren(
  parent: Fiber,
  newChildren: NormalizedChild[],
  domParent: Node,
  anchor: Node | null,
): void {
  // Fast path: positional steady-state, including unchanged keyed lists.
  // Walk the sibling chain and newChildren in lockstep, validating and
  // committing in one pass.
  // On any divergence we fall back to the slow path, which rebuilds the
  // sibling chain anyway — partial pp writes are idempotent.
  // Skips the Map / Set / existing-array allocation entirely.
  if (!currentRoot?.h) {
    let f: Fiber | null = parent.child
    let ok = true
    for (let i = 0; i < newChildren.length; i++) {
      const child = newChildren[i]
      if (child == null || !f) { ok = false; break }
      if (typeof child === 'string') {
        if (f.tag !== FiberTag.Text || f.key != null) { ok = false; break }
        f.pp = child
      } else {
        if (!sameKey(f.key, (child as ReactElement).key)) { ok = false; break }
        if (f.type !== (child as ReactElement).type) { ok = false; break }
        f.pp = (child as ReactElement).props
        f.ref = (child as any).ref ?? null
      }
      f = f.sibling
    }
    if (ok && f === null) {
      // Pass 2: render forward with per-child anchors. Identical to the slow
      // path's pass 2.
      renderChildChain(parent, domParent, anchor)
      return
    }
  }

  if (!parent.child) {
    // Build every sibling before rendering, just like the matching path.
    // A first mount has no old fibers to index, claim or remove.
    rememberChildList(parent)
    let previous: Fiber | null = null
    for (const child of newChildren) {
      if (child == null) continue
      const fiber = fiberFromChild(child, parent)
      if (previous) previous.sibling = fiber
      else parent.child = fiber
      previous = fiber
    }
    renderChildChain(parent, domParent, anchor)
    return
  }

  const existing = collectChildren(parent)
  rememberChildList(parent, existing)
  const keyed = new Map<string, Fiber>()
  for (const f of existing) {
    if (f.key != null) keyed.set('k' + f.key, f)
  }

  let prevNewFiber: Fiber | null = null
  const claimed = new Set<Fiber>()
  let structurallyChanged = false
  // Budget-guided positional matching. We walk `existing` (unkeyed only) with a
  // single cursor `existingIdx` and, on a type mismatch, choose insert vs delete
  // based on the remaining length delta (`budget`):
  //   budget > 0: more new than old remain → treat slot as an INSERTION: keep
  //               the old cursor and create a fresh fiber for new[i].
  //   budget < 0: more old than new remain → treat slot as a DELETION: advance
  //               the old cursor past the mismatched fiber (it'll be um
  //               in the unclaimed pass) and retry.
  //   budget == 0: equal remaining → treat as REPLACE by preferring delete
  //               until budget flips positive or we hit a match.
  // This avoids greedy forward scans that steal a later same-type fiber for a
  // newly inserted leading sibling (e.g. smallMenu flipping null → <div>
  // stealing the content <div>'s fiber and tearing down the drawer fragment).
  let existingIdx = 0
  let unkeyedOld = 0
  for (const f of existing) if (f.key == null) unkeyedOld++
  let unkeyedNew = 0
  for (const c of newChildren) if (c != null) unkeyedNew++
  let budget = unkeyedNew - unkeyedOld

  // Pass 1 (this loop): match against existing fibers and build the sibling
  // chain. Pass 2 (after the loop) renders each fiber with the correct
  // per-child anchor — the firstDomNode of its next still-mounted sibling,
  // or the parent's own anchor for the rightmost. Without per-child anchors
  // a child whose render output type changes from no-DOM (Portal, null) to
  // an in-flow host gets appended to the end of domParent (every child
  // would otherwise share the parent's anchor) and never moves before its
  // later siblings. Hit by the t3code Sidebar swap from a portal-rendering
  // <Sheet> to a <div data-slot=sidebar> when isMobile flips during a
  // Provider re-render.
  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i]
    if (child == null) continue

    let match: Fiber | null = null

    // key-based match
    if (child && typeof child === 'object' && !isTextChild(child) && (child as ReactElement).key != null) {
      const k = 'k' + (child as ReactElement).key
      const m = keyed.get(k)
      if (m && m.type === (child as ReactElement).type) {
        match = m
        keyed.delete(k)
      }
    }

    if (!match) {
      while (existingIdx < existing.length) {
        const cand = existing[existingIdx]!
        if (cand.key != null) {
          existingIdx++
          continue
        }
        if (sameType(cand, child)) {
          match = cand
          existingIdx++
          break
        }
        // Type mismatch at the cursor. Resolve via budget.
        if (budget > 0) {
          // Insertion: leave cand in place, create new for child.
          break
        }
        // Deletion (or replace-as-delete-first): advance past cand. It remains
        // unclaimed and will be um at the end.
        existingIdx++
        budget++
      }
    }

    // Detect reorder: matched fiber is not at its original position
    if (match && existing[i] !== match) structurallyChanged = true

    let fiber: Fiber
    if (match) {
      claimed.add(match)
      fiber = match
      if (isTextChild(child!)) {
        fiber.pp = child
      } else {
        fiber.type = (child as ReactElement).type
        fiber.pp = (child as ReactElement).props
        fiber.ref = (child as any).ref ?? null
      }
    } else {
      fiber = fiberFromChild(child, parent)
      structurallyChanged = true
      if (budget > 0) budget--
    }

    fiber.parent = parent
    fiber.sibling = null
    if (prevNewFiber) prevNewFiber.sibling = fiber
    else parent.child = fiber
    prevNewFiber = fiber
  }

  // Pass 2: walk the sibling chain we just built and render each fiber
  // forward with the correct per-child anchor.
  // An empty replacement has no new chain. The old children remain linked
  // until cleanup below, and must not render again on their way out.
  if (prevNewFiber) renderChildChain(parent, domParent, anchor)

  if (!prevNewFiber) parent.child = null
  else prevNewFiber.sibling = null

  // Head content is additive — server may inject metadata/stylesheets (Vite
  // dev styles, Sentry, analytics) that aren't in the React tree. Unmounting
  // them on every reconcile thrashes styles and causes flash of unstyled
  // content. Keep existing head children that weren't matched this pass.
  const parentIsHeadHost =
    parent.tag === FiberTag.Host &&
    typeof parent.type === 'string' &&
    (parent.type as string).toLowerCase() === 'head'

  if (!parentIsHeadHost) {
    // Unmount unclaimed
    for (const f of existing) {
      if (!claimed.has(f)) {
        unmountFiber(f, domParent)
        structurallyChanged = true
      }
    }
  }

  // During hydration, DOM is already in document order from the cursor-driven
  // adoption walk. Running placeChildrenInOrder here would reappend nodes to
  // the end of domParent when the true anchor (often an end marker comment)
  // isn't reflected in `anchor`. Skip it in hydration mode.
  //
  // For <head>, skip always — HeadContent re-renders routinely (route match
  // changes, providers updating), and reordering every <link>/<style>/<meta>
  // on each re-render causes stylesheet flash and re-download. Head element
  // ordering is semantically fluid; the browser doesn't care about exact
  // order within <head>.
  const parentIsHead = (domParent as Element).nodeName === 'HEAD'
  if (structurallyChanged && !currentRoot?.h && !parentIsHead) {
    placeChildrenInOrder(parent, domParent, anchor)
  }
}

function renderChildChain(parent: Fiber, domParent: Node, anchor: Node | null): void {
  // The first DOM node a later sibling owns holds until that sibling renders,
  // so it is cached instead of rescanned for every child — the rescan is O(n²)
  // on long lists. Anything moving DOM in this parent mid-render (an inline
  // portal move, a nested flushSync, an immediate insert outside a commit)
  // leaves that node somewhere other than where this chain left it, and the
  // next child rescans.
  let cached: Node | null = null
  let owner = parent.child
  let placed: Node | null = null

  for (let f = parent.child; f; f = f.sibling) {
    if (f === owner || (cached && (cached.previousSibling !== placed || cached.parentNode !== domParent))) {
      cached = anchor
      for (owner = f.sibling; owner; owner = owner.sibling) {
        const dom = firstDomNode(owner, domParent)
        if (dom) {
          cached = dom
          break
        }
      }
      placed = cached && cached.previousSibling
    }

    renderFiber(f, domParent, cached)
  }
}

function placeChildrenInOrder(parent: Fiber, domParent: Node, anchor: Node | null): void {
  let c = parent.child
  // One direct DOM child already at its exact anchor needs no collection.
  if ((!currentCommit || domParent === preparedParent) && c && !c.sibling && (c.tag === FiberTag.Host || c.tag === FiberTag.Text) &&
    c.dom?.parentNode === domParent && c.dom.nextSibling === anchor) return
  const doms: Node[] = []
  while (c) {
    collectHostDoms(c, doms)
    c = c.sibling
  }

  if (currentCommit && domParent !== preparedParent) {
    if (doms.length) queuePlacement(doms, domParent, anchor)
  } else placeDomsInOrder(doms, domParent, anchor)
}

function queuePlacement(doms: Node[], parent: Node, anchor: Node | null): void {
  queueMutation(() => placeDomsInOrder(doms, parent, anchor))
}

function placeDomsInOrder(doms: Node[], domParent: Node, anchor: Node | null): void {

  // Pre-check: if our fiber-owned DOM is already in document order within
  // domParent AND the trailing anchor matches, no reorder is needed. This is
  // the common case on stable re-renders, and avoids detaching/re-attaching
  // subtrees (which cancels CSS animations and triggers layout).
  if (doms.length > 0) {
    let current: Node | null = doms[0]!
    let inOrder = current.parentNode === domParent
    for (let i = 1; inOrder && i < doms.length; i++) {
      current = current!.nextSibling
      // Skip foreign nodes (SSR-injected scripts, dev-styles) between owned
      // fiber DOMs — they should stay where they are.
      while (current && current !== doms[i] && !doms.includes(current as Node)) {
        current = current.nextSibling
      }
      if (current !== doms[i]) inOrder = false
    }
    // Also verify the LAST dom's next sibling lines up with `anchor`. A
    // single-dom collection (or correctly-internally-ordered doms) can sit
    // at the WRONG absolute position in domParent and still pass the
    // relative-order check above. This happens when a fiber's render output
    // changes from no-DOM (e.g. a Portal-using <Sheet>, or null) to an
    // in-flow host element: the new host is appended to the end of
    // domParent (because the parent reconcileChildren loop hands every
    // child the same anchor — typically null), and without this trailing
    // check it would never get moved before its later siblings.
    if (inOrder) {
      let last: Node | null = doms[doms.length - 1]!.nextSibling
      while (last && !doms.includes(last as Node) && last !== anchor) {
        last = last.nextSibling
      }
      if (last !== anchor) inOrder = false
    }
    if (inOrder) return
  }

  // Reverse-iterate, anchoring each node before the one that should follow it.
  // This works because by the time we're placing doms[i], doms[i+1] is already
  // in its final slot. Forward iteration is buggy: insertBefore(doms[i],
  // doms[i+1]) pulls doms[i] forward past any nodes that SHOULD move behind
  // it, leaving those nodes mis-anchored (app-starter Analyze/Lucky swap, npm
  // stats library dropdown reorder — both reported by users).
  //
  // Concrete example: start=[A, R, L], target=[A, L, R]. Forward pass gives
  // [L, A, R] (wrong). Reverse pass moves R to end, then L and A are already
  // correct — 1 move, matches target.
  //
  // Skip nodes already in their target position so CSS transitions on stable
  // siblings aren't cancelled (e.g. drawer slide animation).
  for (let i = doms.length - 1; i >= 0; i--) {
    const d = doms[i]!
    const targetNext: Node | null = i + 1 < doms.length ? doms[i + 1]! : anchor
    if (d.parentNode !== domParent || d.nextSibling !== targetNext) {
      domParent.insertBefore(d, targetNext)
    }
  }
}

function collectHostDoms(fiber: Fiber, out: Node[]): void {
  if (fiber.tag === FiberTag.Host || fiber.tag === FiberTag.Text) {
    if (fiber.dom) out.push(fiber.dom)
    return
  }
  if (fiber.tag === FiberTag.Portal) return
  let c = fiber.child
  while (c) {
    collectHostDoms(c, out)
    c = c.sibling
  }
  if (fiber.tag === FiberTag.Suspense && fiber.ms?.f) collectHostDoms(fiber.ms.f, out)
}

function collectChildren(parent: Fiber): Fiber[] {
  const out: Fiber[] = []
  let c = parent.child
  while (c) {
    out.push(c)
    c = c.sibling
  }
  return out
}

// ---------------------------------------------------------------------------
// Rendering per fiber tag
// ---------------------------------------------------------------------------

export type RenderFn = (fiber: Fiber, domParent: Node, anchor: Node | null) => void
export type TypeMatcher = (type: any, marker: any) => FiberTag | null

// Mutable renderer registry indexed by FiberTag. Feature modules install their
// renderer via registerRenderer(); unregistered features render as no-ops. The
// initial registrations below rely on function-declaration hoisting — every
// render* function is declared with `function` later in this file.
const RENDERERS: Array<RenderFn | undefined> = new Array(13)

// Element-marker allowlist for child normalization (pushChildren). Core-always
// markers are seeded here; features add their own via registerElementMarker.
const ACCEPTED_ELEMENT_MARKERS = new Set<symbol>([
  REACT_ELEMENT_TYPE as symbol,
  REACT_LEGACY_ELEMENT_TYPE as symbol,
])

// Type-to-tag matchers tried in registration order from fiberFromChild's
// fallback branch. Features register here for element types that aren't
// marker-based (e.g. Portal, where element.type IS the symbol).
const TYPE_MATCHERS: TypeMatcher[] = []

export function registerRenderer(tag: FiberTag, fn: RenderFn): void {
  RENDERERS[tag] = fn
}

export function registerTypeMatcher(m: TypeMatcher): void {
  TYPE_MATCHERS.push(m)
}

export function registerElementMarker(sym: symbol): void {
  ACCEPTED_ELEMENT_MARKERS.add(sym)
}

// Accessor + scoped setter for the module-level `currentRoot`. Feature modules
// need these to participate in the render loop (e.g. Suspense re-hydration
// must temporarily set the root while rebuilding a boundary subtree).
export function getCurrentRoot(): FiberRoot | null {
  return currentRoot
}

export function withCurrentRoot<T>(root: FiberRoot | null, fn: () => T): T {
  const prev = currentRoot
  currentRoot = root
  try {
    return fn()
  } finally {
    currentRoot = prev
  }
}

// The memo feature uses this to bypass its prop-equality gate on state-driven
// rerenders of the memoized fiber itself (hook update / subscribed store),
// where props haven't changed by definition.
export function getForceRerenderingFiber(): Fiber | null {
  return forceRerenderingFiber
}

registerRenderer(FiberTag.Text, renderText)
registerRenderer(FiberTag.Host, renderHost)
registerRenderer(FiberTag.Resource, renderHost)
registerRenderer(FiberTag.Function, renderFunction)
registerRenderer(FiberTag.Fragment, renderFragment)

export function renderFiber(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  // Memo consumes pending state when it delegates to its inner renderer.
  if (fiber.tag !== FiberTag.Memo) fiber.dy = false
  fiber.root ||= currentRoot || findRoot(fiber)
  if (fiber.root?.sp && fiber.parent?.ld && fiber.mp === null) setLayoutDisconnected(fiber, true)
  if (fiber.root?.a) CAPABILITIES.prepareActivityFiber(fiber)
  const fn = RENDERERS[fiber.tag]
  try {
    if (fn) fn(fiber, domParent, anchor)
  } catch (error) {
    removeStagedCommits(fiber)
    if (currentRoot?.h || error instanceof RenderErrorCapture || error instanceof RenderSuspenseCapture || isHydrationBailout(error)) throw error
    if (isThenable(error)) handleSuspended(fiber, error)
    else handleErrorInRender(fiber, error)
  }
  if (fiber.root?.a) CAPABILITIES.syncActivity(fiber)
  if (lastStagedFiber === fiber) flushFiberCommits(fiber)
}

function renderText(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const text = fiber.pp as string
  // Identity-unchanged fast path: skip the native Text.data write entirely.
  if (fiber.dom && fiber.mp === text) return
  if (!fiber.dom) {
    const hydrated = currentRoot?.h ? adoptTextDom(fiber, fiber.parent!, text) : false
    if (!hydrated) {
      fiber.dom = document.createTextNode(text)
      insertInto(domParent, fiber.dom, anchor)
    }
    updateFragmentHost(fiber, true)
  } else {
    // Past the fast path, and adoptTextDom already realigned `.data` on
    // hydration — `.data !== text` here is guaranteed, so write directly.
    queueText(fiber.dom as Text, text)
  }
  fiber.mp = text
  // dy cleared at rerender start; leaving true lets mid-render schedule persist
}

function renderHost(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const hadDom = !!fiber.dom
  const props = fiber.pp ?? {}
  const prev = fiber.mp ?? {}
  const type = fiber.type as string
  const isSvg = type === 'svg' || (domParent as Element).namespaceURI === 'http://www.w3.org/2000/svg'
  const isResource = fiber.tag === FiberTag.Resource
  const canAcquire = !isSvg && (isResource || !fiber.mp) && resourceKind(type, props)
  if (isResource || canAcquire) {
    fiber.tag = FiberTag.Resource
    if (canAcquire) {
      let container: Node = domParent.nodeType === 9 ? domParent : domParent.ownerDocument!
      if (type !== 'script') {
        // Host assembly may still be detached. Style ownership follows the
        // logical root or nearest portal, not that temporary DOM tree.
        container = fiber.root?.c || domParent
        for (let parent = fiber.parent; parent; parent = parent.parent) {
          if (parent.tag === FiberTag.Portal) { container = parent.pp.container; break }
        }
      }
      queueMutation(() => {
        const resource = acquireResource(type, props, container)
        fiber.sn ||= resource
      })
    }
    if (fiber.mp) syncRefIfChanged(fiber, fiber.sn)
    else attachRef(fiber, null)
    fiber.mp = props
    return
  }

  // <select value> must be applied AFTER children mount — setting `.value`
  // on a `<select>` with no matching `<option>` yet resets it to empty. Same
  // for `defaultValue` on first mount. Stash and replay.
  const isSelect = type === 'select'
  const isInput = !isSvg && type === 'input'
  const isTextarea = !isSvg && type === 'textarea'
  const deferValue = isSelect || isInput || isTextarea
  let hydrated = false
  const deferredSelectValue =
    isSelect && (props.value !== undefined || props.defaultValue !== undefined)
      ? props.value !== undefined ? props.value : props.defaultValue
      : undefined

  if (!fiber.dom) {
    hydrated = currentRoot?.h ? adoptHostDom(fiber, fiber.parent!) : false
    if (!hydrated) {
      fiber.dom = createHostNode(type, isSvg)
      // Two passes so form-control attributes (notably <input type>) are in
      // place before event handlers attach. setEventHandler reads the
      // element's runtime state to decide the DOM event name (e.g. onChange
      // → `input` vs `change`); binding before `type` is applied would
      // attach to the wrong event for checkbox/radio/file inputs.
      for (const k in props) {
        if ((deferValue && (k === 'value' || k === 'defaultValue')) || (isInput && (k === 'checked' || k === 'defaultChecked' || k === 'name'))) continue
        if (isEventProp(k)) continue
        setProp(fiber.dom as Element, k, props[k], undefined, isSvg)
      }
      for (const k in props) {
        if (!isEventProp(k)) continue
        setProp(fiber.dom as Element, k, props[k], undefined, isSvg)
      }
      if (isInput) {
        syncInputValue(fiber.dom as HTMLInputElement, props)
        setProp(fiber.dom as Element, 'name', props.name, undefined, false)
      }
      if (isTextarea) syncTextareaValue(fiber.dom as HTMLTextAreaElement, props, true)
      insertInto(domParent, fiber.dom, anchor)
    }
    updateFragmentHost(fiber, true)
    attachRef(fiber, fiber.dom)
  } else if (prev !== props && (isInput || isTextarea || hostNeedsUpdate(props, prev))) {
    queueHostProps(fiber.dom as Element, props, prev, isSvg, isInput, isTextarea, deferValue)
  }
  if (hadDom) syncRefIfChanged(fiber, fiber.dom)

  // Children go into this DOM node
  // Textarea's value/defaultValue owns its text node, not child fibers.
  if (!hadDom && !hydrated) {
    // Only a host allocated by this render is safe to assemble eagerly.
    // User-owned detached roots and portal containers still commit normally.
    const previous = preparedParent
    preparedParent = fiber.dom
    try { reconcileChildren(fiber, isTextarea ? [] : childrenToArray(props.children), fiber.dom!, null) }
    finally { preparedParent = previous }
  } else reconcileChildren(fiber, isTextarea ? [] : childrenToArray(props.children), fiber.dom!, null)

  // During hydration, if after reconciling all client-expected children we
  // still have server DOM left in the cursor for this host, that's a
  // structural mismatch (server produced more than client wants). Report.
  // <head>/<html> are position-insensitive — leftover here is normal
  // (Vite dev-style injections, SSR-only scripts, etc.).
  if (currentRoot?.h) {
    const parentTag = (fiber.type as string).toLowerCase()
    const hasOpaqueHydrationChildren =
      props.dangerouslySetInnerHTML != null ||
      isTextarea
    if (
      parentTag !== 'head' &&
      parentTag !== 'html' &&
      parentTag !== 'body' &&
      !hasOpaqueHydrationChildren
    ) {
      const cursor = getHydrationCursor(fiber)
      if (cursor) {
        if (cursor.has()) {
          const error = new Error(
            process.env.NODE_ENV !== 'production'
              ? `Hydration mismatch: server rendered extra nodes inside <${parentTag}>.`
              : 'Hydration mismatch.',
          )
          if (currentRoot.re) currentRoot.re(error, { componentStack: null })
          abortHydration(error, fiber)
        }
      }
    }
  }

  // Apply <select> value after options are mounted.
  if (isSelect && !hydrated && deferredSelectValue !== undefined) {
    queueSelectValue(fiber.dom as HTMLSelectElement, deferredSelectValue)
  }

  fiber.mp = props
  // dy cleared at rerender start; leaving true lets mid-render schedule persist
}

function queueSelectValue(select: HTMLSelectElement, value: any): void {
  queueMutation(() => {
    if (Array.isArray(value)) {
      const selected = new Set(value.map((v) => '' + v))
      const options = select.options
      for (let i = 0; i < options.length; i++) {
        const opt = options[i]!
        opt.selected = selected.has(opt.value)
      }
    } else {
      select.value = '' + value
    }
  })
}

function hostNeedsUpdate(props: any, previous: any): boolean {
  for (const key in props) {
    if (props[key] !== previous[key] && key !== 'children' && key !== 'ref' && key !== 'key') return true
  }
  for (const key in previous) {
    if (key !== 'children' && key !== 'ref' && key !== 'key' && !(key in props)) return true
  }
  return false
}

function queueHostProps(el: Element, props: any, prev: any, isSvg: boolean, isInput: boolean, isTextarea: boolean, deferValue: boolean): void {
  queueMutation(() => {
    // Radio groups stay disconnected until type, value and checked agree.
    if (isInput) setProp(el, 'name', '', undefined, false)
    let events: string[] | undefined
    for (const key in props) {
      const next = props[key], previous = prev[key]
      if (next === previous || key === 'children' || key === 'ref' || key === 'key' || (deferValue && (key === 'value' || key === 'defaultValue')) || (isInput && (key === 'checked' || key === 'defaultChecked' || key === 'name'))) continue
      if (isEventProp(key)) {
        (events ||= []).push(key)
      } else setProp(el, key, next, previous, isSvg)
    }
    for (const key in prev) {
      if (key === 'children' || key === 'ref' || key === 'key' || ((isInput || isTextarea) && (key === 'value' || key === 'defaultValue')) || (isInput && (key === 'checked' || key === 'defaultChecked' || key === 'name'))) continue
      if (!(key in props)) setProp(el, key, undefined, prev[key], isSvg)
    }
    // Event resolution sees the new input type, as it does on mount.
    if (events) for (const key of events) setProp(el, key, props[key], prev[key], isSvg)
    if (isInput) {
      syncInputValue(el as HTMLInputElement, props, prev)
      setProp(el, 'name', props.name, prev.name, false)
    } else if (isTextarea) syncTextareaValue(el as HTMLTextAreaElement, props)
  })
}

function renderFunction(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const canBail = fiber === forceRerenderingFiber && fiber.pp === fiber.mp
  fiber.cx?.clear()
  let rendered: ReactNode | typeof HOOK_BAILOUT
  let deferredForHydration = false
  try {
    rendered = renderWithHooks(fiber, fiber.type, fiber.pp ?? {}, undefined, canBail)
  } catch (e: any) {
    if (isThenable(e)) {
      if (deferHydration(fiber, e)) {
        deferredForHydration = true
      } else {
        handleSuspended(fiber, e)
        return
      }
    } else {
      handleErrorInRender(fiber, e)
      return
    }
  }

  if (deferredForHydration || rendered === HOOK_BAILOUT) return

  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.mp = fiber.pp
  // dy cleared at rerender start; leaving true lets mid-render schedule persist
}

function hasAncestorHydrationCursor(_fiber: Fiber): boolean {
  // Reserved for future per-Suspense-boundary hydration deferral. For now the
  // top-level hydration path is all we need to special-case.
  return false
}

export function deferHydration(fiber: Fiber, thenable: Promise<any>): boolean {
  if (!currentRoot?.h) return false
  const hostParent = findHydrationHost(fiber)
  const inheritedCursor = getHydrationCursor(hostParent)
  if (inheritedCursor) setHydrationCursor(fiber, inheritedCursor)
  ;((fiber.ms ??= {}) as any).p = true
  let sus: Fiber | null = fiber.parent
  while (sus && sus.tag !== FiberTag.Suspense) sus = sus.parent
  if (sus && sus.ms) {
    ;(sus.ms as any).a = true
  }
  const clearAwait = () => {
    if (sus && sus.ms) {
      ;(sus.ms as any).a = false
    }
    scheduleUpdate(fiber)
  }
  thenable.then(clearAwait, clearAwait)
  return true
}

function renderFragment(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const props = fiber.pp ?? {}
  reconcileChildren(fiber, childrenToArray(props.children), domParent, anchor)
  if (fiber.type === REACT_FRAGMENT_TYPE) {
    if (fiber.ref && !fiber.sn) fiber.sn = createFragmentInstance(fiber)
    const previous = fiber.ms?.ref
    if (previous !== fiber.ref) {
      if (fiber.cu) {
        const cleanups = fiber.cu
        queueMutation(() => {
          for (const cleanup of cleanups) {
            try { cleanup() } catch (error) { handleCommitError(fiber, error) }
          }
        })
        fiber.cu = null
      }
      detachRef(previous, fiber)
      fiber.ms = { ...fiber.ms, ref: fiber.ref }
      if (fiber.sn) attachRef(fiber, fiber.sn)
    }
  }
  fiber.mp = props
  // dy cleared at rerender start; leaving true lets mid-render schedule persist
}

// ---------------------------------------------------------------------------
// Error handling + default Suspense capability
// ---------------------------------------------------------------------------

// Default handler when the Suspense feature isn't installed: just schedule
// a re-render when the thrown thenable settles. No boundary walk, no
// fallback swap — children render empty during the pending window.
function defaultHandleSuspended(fiber: Fiber, thenable: Promise<any>): void {
  thenable.then(
    () => scheduleUpdate(fiber),
    () => scheduleUpdate(fiber),
  )
}

// ---------------------------------------------------------------------------
// Capability hooks — cross-cutting behaviors that features override.
// Defaults here preserve today's behavior so the indirection is transparent
// when all features are loaded. A feature's full-module can install its own
// implementation via installCapability(); stubs leave the default in place,
// where the default may intentionally degrade (e.g. a no-Context build's
// readContext never walks the tree because no Provider fibers exist).
// ---------------------------------------------------------------------------

export interface Capabilities {
  handleSuspended: (fiber: Fiber, thenable: Promise<any>) => void
  readContext: (fiber: Fiber, ctx: any) => any
  isActivityHidden: (fiber: Fiber) => boolean
  activityIsDisconnected: (fiber: Fiber) => boolean
  prepareActivityFiber: (fiber: Fiber) => void
  syncActivity: (fiber: Fiber) => void
}

const CAPABILITIES: Capabilities = {
  handleSuspended: defaultHandleSuspended,
  readContext: defaultReadContext,
  isActivityHidden: () => false,
  activityIsDisconnected: () => false,
  prepareActivityFiber: () => {},
  syncActivity: () => {},
}

export function isActivityHidden(fiber: Fiber): boolean {
  return !!(fiber.root ?? currentRoot ?? findRoot(fiber))?.a && CAPABILITIES.isActivityHidden(fiber)
}

export function activityIsDisconnected(fiber: Fiber): boolean {
  return !!fiber.root?.a && CAPABILITIES.activityIsDisconnected(fiber)
}

export function layoutIsDisconnected(fiber: Fiber): boolean {
  return !!fiber.ld || activityIsDisconnected(fiber)
}

export function rememberActivityEffect(fiber: Fiber, hook: Hook, effect: Effect): void {
  if (fiber.root?.a || (fiber.root?.sp && effect.t === 1 && !effect.s)) rememberRetainedEffect(fiber, hook, effect)
}

export function installCapability<K extends keyof Capabilities>(
  name: K,
  fn: Capabilities[K],
): void {
  CAPABILITIES[name] = fn
}

// Wrapper for features that catch thrown thenables inside their render
// functions. Delegates to the installed Suspense capability.
export function handleSuspended(fiber: Fiber, thenable: Promise<any>): void {
  if (isActivityHidden(fiber) && !findSuspenseBoundary(fiber)) {
    defaultHandleSuspended(fiber, thenable)
    return
  }
  CAPABILITIES.handleSuspended(fiber, thenable)
}

export class RenderSuspenseCapture {
  constructor(public boundary: Fiber) {}
}

export function findSuspenseBoundary(fiber: Fiber): Fiber | null {
  let child = fiber
  for (let parent = fiber.parent; parent; parent = parent.parent) {
    if (parent.tag === FiberTag.Suspense && parent.ms?.f !== child) return parent
    // Hidden prerendering cannot activate a fallback outside its Activity.
    if (parent.tag === FiberTag.Activity && parent.pp?.mode === 'hidden') return null
    child = parent
  }
  return null
}

export class RenderErrorCapture {
  stack: string
  constructor(public boundary: Fiber, public error: unknown, source: Fiber = boundary) {
    this.stack = componentStack(source)
  }
}

function captureError(capture: RenderErrorCapture): void {
  const fiber = capture.boundary
  fiber.ms = { ...fiber.ms, error: capture }
  scheduleUpdate(fiber)
}

function findErrorBoundary(fiber: Fiber): Fiber | null {
  for (let parent = fiber.parent; parent; parent = parent.parent) {
    if (parent.um || parent.pd) continue
    const instance = parent.sn
    if (instance?._fiber === parent && (parent.ms?.b?.getDerivedStateFromError || instance.componentDidCatch)) return parent
  }
  return null
}

function captureRootError(root: FiberRoot, stack: string, error: unknown): void {
  const errors = root.er ||= []
  if (!errors.length) root.u = undefined
  errors.push({ error, stack })
  scheduleUpdate(root.r)
}

function flushRootErrors(root: FiberRoot): void {
  const errors = root.er!
  root.er = undefined
  if (root.r.mp === null) queueMutation(() => { root.c.textContent = '' })
  renderRoot(root, null)
  queueCommitEffects(() => {
    for (const captured of errors) {
      try {
        if (root.ue) root.ue(captured.error, { componentStack: captured.stack })
        else if (typeof reportError === 'function') reportError(captured.error)
        else queueMicrotask(() => { throw captured.error })
      } catch (error) { setTimeout(() => { throw error }) }
    }
  })
  if (root.u) pendingRoots.add(root)
}

export function recoverRootError(error: unknown, abort?: () => void): boolean {
  if (!(error instanceof RenderErrorCapture) || error.boundary.tag !== FiberTag.Root) return false
  const root = error.boundary.root!
  abort?.()
  discardPendingWork(root)
  discardPendingEffects(root)
  captureRootError(root, error.stack, error.error)
  return true
}

export function handleCommitError(fiber: Fiber, error: unknown): void {
  const boundary = findErrorBoundary(fiber)
  if (boundary) {
    captureError(new RenderErrorCapture(boundary, error, fiber))
    return
  }
  const root = findRoot(fiber)
  if (root) captureRootError(root, componentStack(fiber), error)
  else queueMicrotask(() => { throw error })
}

export function handleErrorInRender(fiber: Fiber, err: any): void {
  if (err instanceof RenderErrorCapture) throw err
  removeStagedCommits(fiber)
  for (const queue of [pendingEffects, pendingInsertionEffects, pendingCommits]) {
    for (let index = queue.length - 1; index >= 0; index--) {
      if (queue[index]![0] === fiber) removePendingEffect(queue, index)
    }
  }
  if (currentRoot?.h) {
    abortHydration(err, fiber)
  }
  // Bubble to nearest class boundary with getDerivedStateFromError / componentDidCatch
  const boundary = findErrorBoundary(fiber)
  if (boundary) {
    const capture = new RenderErrorCapture(boundary, err, fiber)
    if (currentCommit) throw capture
    captureError(capture)
    return
  }
  // Abort the prepared render. Its mutation/effect queues must not commit
  // before the root is cleared and the error callback runs.
  const root = currentRoot ?? findRoot(fiber)
  if (root && currentCommit && (flushing || root.ue)) throw new RenderErrorCapture(root.r, err, fiber)
  if (root?.ue) root.ue(err, { componentStack: componentStack(fiber) })
  else throw err
}

export function isThenable(x: any): x is Promise<any> {
  return x != null && typeof x.then == 'function'
}

// ---------------------------------------------------------------------------
// Unmount
// ---------------------------------------------------------------------------

export function unmountFiber(fiber: Fiber, domParent: Node, remove = true): void {
  if (fiber.um) return
  if (currentCommit) return queueUnmount(fiber, domParent, remove)
  removeStagedCommits(fiber)
  if (fiber.type === REACT_FRAGMENT_TYPE && fiber.sn) {
    if (fiber.cu) {
      for (const cleanup of fiber.cu) {
        try { cleanup() } catch (error) { handleCommitError(fiber, error) }
      }
      fiber.cu = null
    }
    detachRef(fiber.cr ?? fiber.ref, fiber)
  }
  fiber.um = true
  if (fiber.tag === FiberTag.Host || fiber.tag === FiberTag.Text) updateFragmentHost(fiber, false)
  if (fiber.type === REACT_FRAGMENT_TYPE && fiber.sn) fiber.sn.dispose()
  if (fiber.tag === FiberTag.Suspense && fiber.ms?.f) {
    unmountFiber(fiber.ms.f, domParent, remove)
    fiber.ms.f = null
  }
  // Run cu (fx + layout fx)
  if (fiber.cu) {
    const cleanups = fiber.cu
    fiber.cu = null
    for (const cleanup of cleanups) {
      try {
        cleanup()
      } catch (e) {
        handleCommitError(fiber, e)
      }
    }
  }

  if (fiber.sn?._fiber === fiber) {
    const committed = fiber.ms?.c
    if (committed) { fiber.sn.props = committed.props; fiber.sn.state = committed.state }
    if (fiber.sn.componentWillUnmount && !layoutIsDisconnected(fiber)) {
      try {
        fiber.sn.componentWillUnmount()
      } catch (e) {
        handleCommitError(fiber, e)
      }
    }
    fiber.sn._fiber = null
    fiber.sn._enqueueUpdate = null
    fiber.sn._forceUpdate = null
  }

  // Detach ref
  if (fiber.cr ?? fiber.ref) detachRef(fiber.cr ?? fiber.ref, fiber)

  let c = fiber.child
  while (c) {
    const next = c.sibling
    unmountFiber(c, fiber.tag === FiberTag.Host ? fiber.dom! : domParent, fiber.tag === FiberTag.Portal || (remove && fiber.tag !== FiberTag.Host))
    c = next
  }
  fiber.child = null

  // Remove DOM if host
  if (remove && (fiber.tag === FiberTag.Host || fiber.tag === FiberTag.Text) && fiber.dom?.parentNode) {
    fiber.dom.parentNode.removeChild(fiber.dom)
  }
}

function queueUnmount(fiber: Fiber, domParent: Node, remove: boolean): void {
  if (fiber.pd) return
  // Keep committed DOM available for snapshots, but stop deleted work now.
  const deleted: Fiber[] = []
  markPendingDeletion(fiber, deleted)
  const restore = () => { for (const child of deleted) child.pd = false }
  onCommitRollback(restore)
  onCommitFailure(restore)
  queueMutation(() => unmountFiber(fiber, domParent, remove))
}

function markPendingDeletion(fiber: Fiber, deleted: Fiber[]): void {
  if (fiber.pd) return
  fiber.pd = true
  deleted.push(fiber)
  for (let child = fiber.child; child; child = child.sibling) markPendingDeletion(child, deleted)
  if (fiber.tag === FiberTag.Suspense && fiber.ms?.f) markPendingDeletion(fiber.ms.f, deleted)
}

export function unmountAllChildren(parent: Fiber, domParent: Node): void {
  let c = parent.child
  while (c) {
    const next = c.sibling
    unmountFiber(c, domParent)
    c = next
  }
  parent.child = null
}

// ---------------------------------------------------------------------------
// DOM navigation helpers
// ---------------------------------------------------------------------------

function insertInto(parent: Node, node: Node, anchor: Node | null): void {
  if (currentCommit && parent !== preparedParent) return queueInsertion(parent, node, anchor)
  const projectedHeadParent = getDocumentHeadInsertionParent(parent, node)
  if (projectedHeadParent) {
    projectedHeadParent.appendChild(node)
    return
  }

  // Anchor may have been removed or moved since it was computed (mutations
  // from unmount, boundary reveal, user code, HMR). If it's no longer a child
  // of `parent`, fall back to append — trying to insertBefore a non-child
  // throws NotFoundError and dev-loops the reconciler.
  if (anchor && anchor.parentNode === parent) {
    parent.insertBefore(node, anchor)
  } else {
    parent.appendChild(node)
  }
}

function queueInsertion(parent: Node, node: Node, anchor: Node | null): void {
  queueMutation(() => insertInto(parent, node, anchor))
}

const DOCUMENT_HEAD_TAGS = new Set(['base', 'link', 'meta', 'script', 'style', 'title'])

function getDocumentHeadInsertionParent(parent: Node, node: Node): HTMLHeadElement | null {
  if (parent.nodeType !== 9 || node.nodeType !== 1) return null
  const tag = (node as Element).tagName.toLowerCase()
  if (!DOCUMENT_HEAD_TAGS.has(tag)) return null
  return (parent as Document).head
}

export function getHostParent(fiber: Fiber): Node {
  let p = fiber.parent
  while (p) {
    if (p.tag === FiberTag.Host) return p.dom!
    if (p.tag === FiberTag.Root)
      return (p.sn as Node) || (p.dom as Node) || (p.root?.c as Node)
    if (p.tag === FiberTag.Portal) {
      // Portal renders its children into the `container` prop, not into any
      // DOM element the portal fiber "owns". Read the container from the
      // portal's own props so a rerenderFiber triggered on a descendant
      // (e.g. a Floating-UI-positioned popper in a Radix Portal) finds its
      // host parent — otherwise getHostParent returns undefined and the
      // next renderHost crashes reading `.namespaceURI` on undefined.
      const props = (p.pp ?? p.mp) as { container?: Element } | null
      return (props?.container as Node) || (p.sn as Node) || (p.dom as Node) || (p.root?.c as Node)
    }
    p = p.parent
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('No host parent found.')
  }
  throw new Error()
}

export function getAnchor(fiber: Fiber, domParent: Node): Node | null {
  let p: Fiber | null = fiber
  while (p) {
    let sibling = p.sibling
    while (sibling) {
      const d = firstDomNode(sibling, domParent)
      if (d) return d
      sibling = sibling.sibling
    }
    p = p.parent
    if (p?.tag === FiberTag.Host || p?.tag === FiberTag.Root || p?.tag === FiberTag.Portal) break
  }
  return null
}

function firstDomNode(fiber: Fiber, domParent: Node): Node | null {
  if (fiber.tag === FiberTag.Host || fiber.tag === FiberTag.Text) {
    return fiber.dom?.parentNode === domParent ? fiber.dom : null
  }
  let c = fiber.child
  while (c) {
    const d = firstDomNode(c, domParent)
    if (d) return d
    c = c.sibling
  }
  return fiber.tag === FiberTag.Suspense && fiber.ms?.f ? firstDomNode(fiber.ms.f, domParent) : null
}

// ---------------------------------------------------------------------------
// Context read — exported for dispatcher.ts (useContext, use()). Delegates to
// the installed capability so the Context feature can override with a walking
// implementation that finds the nearest Provider fiber. When the feature is
// stubbed, the default here returns ctx._currentValue — correct because no
// Provider fibers exist in the tree (Provider element → Fragment via the
// stub's type matcher).
// ---------------------------------------------------------------------------

export function readContext(fiber: Fiber, ctx: any): any {
  return CAPABILITIES.readContext(fiber, ctx)
}

function defaultReadContext(_fiber: Fiber, ctx: any): any {
  return ctx._currentValue
}

// ---------------------------------------------------------------------------
// Refs
// ---------------------------------------------------------------------------

export function attachRef(fiber: Fiber, value: any): void {
  const ref = fiber.ref ?? (fiber.pp?.ref ?? null)
  if (!ref) return
  if (isActivityHidden(fiber) || layoutIsDisconnected(fiber)) return
  stageCommit(fiber, () => {
    if (fiber.tag === FiberTag.Resource) value = fiber.sn
    fiber.cr = ref
    if (typeof ref == 'function') {
      // Callback refs run during commit, after insertion effects install
      // event callback implementations and in subtree layout order.
      const cleanup = ref(value)
      fiber.cu ||= []
      const detach = typeof cleanup == 'function' ? cleanup : () => ref(null)
      fiber.rc = detach
      fiber.cu.push(detach)
    } else {
      ref.current = value
    }
  }, true)
}

export function syncRefIfChanged(fiber: Fiber, value: any): void {
  const ref = fiber.ref ?? (fiber.pp?.ref ?? null)
  if (!ref && !fiber.cr) return
  if (isActivityHidden(fiber) || layoutIsDisconnected(fiber)) return
  const previous = fiber.cr ?? null
  if (previous !== ref) {
    const cleanup = fiber.rc
    queueMutation(() => {
      if (cleanup) {
        const index = fiber.cu?.indexOf(cleanup) ?? -1
        if (index >= 0) fiber.cu!.splice(index, 1)
        fiber.rc = null
        try { cleanup() } catch (error) { handleCommitError(fiber, error) }
      }
      detachRef(previous, fiber)
      fiber.cr = null
    })
    attachRef(fiber, value)
  } else if (ref && typeof ref === 'object' && ref.current !== value) attachRef(fiber, value)
}

export function detachRef(ref: any, fiber?: Fiber): void {
  // Function refs are handled via fiber.cu (queued in attachRef during
  // the commit phase): the cleanup either invokes the user-returned cleanup
  // fn or calls ref(null). Calling ref(null) here would double-fire it.
  if (ref && typeof ref === 'object') {
    queueMutation(() => {
      try { ref.current = null }
      catch (error) { if (fiber) handleCommitError(fiber, error); else throw error }
    })
  }
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

const pendingEffects: Array<[Fiber, Effect]> = []
const pendingInsertionEffects: Array<[Fiber, Effect]> = []
type LayoutCommit = [Fiber, Effect | (() => void), boolean]
const pendingCommits: LayoutCommit[] = []
const stagedCommits = new Map<Fiber, LayoutCommit[]>()
// Track only fibers with queued work. A ref-less descendant can finish with
// one identity check, even while an ancestor has a pending layout effect.
const stagedFibers: Fiber[] = []
let lastStagedFiber: Fiber | undefined

// Appends are covered by checkpoint lengths. Only removals need to retain
// the affected entry, and only while a render has a rollback checkpoint.
function removePendingEffect(queue: Array<[Fiber, Effect] | LayoutCommit>, index: number): void {
  const entry = queue[index]!
  queue.splice(index, 1)
  if (currentCommit?.c.length) onCommitRollback(() => { queue.splice(index, 0, entry) })
}

function stageCommit(fiber: Fiber, work: Effect | (() => void), ref = false): void {
  let entries = stagedCommits.get(fiber)
  if (!entries) {
    stagedCommits.set(fiber, entries = [])
    stagedFibers.push(fiber)
    lastStagedFiber = fiber
  }
  entries.push([fiber, work, ref])
}

function removeStagedCommits(fiber: Fiber): void {
  if (!stagedCommits.delete(fiber)) return
  if (lastStagedFiber === fiber) stagedFibers.pop()
  else stagedFibers.splice(stagedFibers.lastIndexOf(fiber), 1)
  lastStagedFiber = stagedFibers[stagedFibers.length - 1]
}

// Rendering already visits the tree in order. Completing a fiber stages its
// layout work after its children, without another tree walk at commit time.
export function flushFiberCommits(fiber: Fiber): void {
  const entries = stagedCommits.get(fiber)
  if (!entries) return
  removeStagedCommits(fiber)
  if (fiber.type === REACT_FRAGMENT_TYPE) {
    // React attaches Fragment refs before their descendants. Only referenced
    // Fragments need to locate this insertion point among queued commits.
    let index = pendingCommits.length
    outer: for (let i = 0; i < pendingCommits.length; i++) {
      for (let parent = pendingCommits[i]![0].parent; parent; parent = parent.parent) {
        if (parent === fiber) { index = i; break outer }
      }
    }
    if (index < pendingCommits.length && currentCommit?.c.length) {
      const count = entries.length
      onCommitRollback(() => { pendingCommits.splice(index, count) })
    }
    pendingCommits.splice(index, 0, ...entries)
  } else if (fiber.tag === FiberTag.Class || fiber.sn?._fiber === fiber) {
    for (const entry of entries) if (!entry[2]) pendingCommits.push(entry)
    for (const entry of entries) if (entry[2]) pendingCommits.push(entry)
  } else {
    for (const entry of entries) pendingCommits.push(entry)
  }
}

export function enqueueEffect(fiber: Fiber, effect: Effect): void {
  if (effect.t !== 2 && (isActivityHidden(fiber) || activityIsDisconnected(fiber) || (effect.t === 1 && !effect.s && fiber.ld))) return
  if (effect.t === 2) pendingInsertionEffects.push([fiber, effect])
  else if (effect.t === 1) stageCommit(fiber, effect)
  else pendingEffects.push([fiber, effect])
}

export function scheduleLifecycle(fiber: Fiber, fn: () => void): void {
  if (isActivityHidden(fiber) || layoutIsDisconnected(fiber)) return
  stageCommit(fiber, fn)
}

export function runEffects(root: FiberRoot): void {
  if (root.fr) refreshFragmentInstances(root)
  if (!pendingInsertionEffects.length && !pendingCommits.length && !pendingEffects.length) return
  flushEffects(root)
}

function flushEffects(root: FiberRoot): void {
  const insertion = pendingInsertionEffects.splice(0)
  const layout = pendingCommits.splice(0)
  const batch = pendingEffects.splice(0)
  if (currentCommit?.c.length) onCommitRollback(() => {
    // A nested render can drain these queues before an enclosing attempt
    // fails. Reuse the captured batches, then older checkpoints trim tails.
    pendingInsertionEffects.unshift(...insertion)
    pendingCommits.unshift(...layout)
    pendingEffects.unshift(...batch)
  })
  queueCommitEffects(() => {
  for (const [fiber, effect] of insertion) runEffect(fiber, effect, root)
  if (layout.length) {
    for (const [fiber, work] of layout) {
      if (typeof work !== 'function' && !fiber.um && !isActivityHidden(fiber) && !layoutIsDisconnected(fiber)) work.d?.()
    }
    const runLayout = () => {
      for (const [fiber, work] of layout) {
        if (typeof work !== 'function') runEffect(fiber, work, root)
        else if (!fiber.um && !isActivityHidden(fiber) && !layoutIsDisconnected(fiber)) {
          try { work() } catch (error) { handleCommitError(fiber, error) }
        }
      }
    }
    if (!deferTransitionLayout(runLayout)) runLayout()
  }
  // Passive fx on microtask
  if (batch.length) {
    const passive = () => {
      for (const [fiber, effect] of batch) runEffect(fiber, effect, root)
    }
    if (!deferTransitionPassive(passive)) queueMicrotask(passive)
  }
  })
}

setCommitCheckpointHook(() => {
  // A parent allocated before this savepoint can contain eager insertions
  // from an abandoned child render. Restore only that new, detached host.
  const parent = preparedParent as Element | null
  const children = parent && Array.from(parent.childNodes)
  const effects = pendingEffects.length, insertion = pendingInsertionEffects.length, commits = pendingCommits.length
  const staged = new Map([...stagedCommits].map(([fiber, work]) => [fiber, work.slice()]))
  const stack = stagedFibers.slice(), last = lastStagedFiber
  onCommitRollback(() => {
    if (parent) parent.replaceChildren(...children!)
    pendingEffects.length = effects
    pendingInsertionEffects.length = insertion
    pendingCommits.length = commits
    stagedCommits.clear()
    for (const [fiber, work] of staged) stagedCommits.set(fiber, work)
    stagedFibers.splice(0, stagedFibers.length, ...stack)
    lastStagedFiber = last
  })
})

function runEffect(fiber: Fiber, effect: Effect, root: FiberRoot): void {
  if (fiber.um) return
  if (effect.t !== 2 && (isActivityHidden(fiber) || activityIsDisconnected(fiber) || (effect.t === 1 && !effect.s && fiber.ld))) return
  try {
    const cleanup = effect.c()
    if (typeof cleanup == 'function') {
      fiber.cu ||= []
      fiber.cu.push(cleanup)
    }
  } catch (e) {
    handleCommitError(fiber, e)
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function isEventProp(name: string): boolean {
  return (
    name.length > 2 &&
    name.charCodeAt(0) === 111 /* o */ &&
    name.charCodeAt(1) === 110 /* n */ &&
    name.charCodeAt(2) >= 65 /* 'A'-ish: any uppercase start (onClick, onChange, …) */
  )
}

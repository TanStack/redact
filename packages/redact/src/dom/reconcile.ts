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
  type Hook,
  type Effect,
} from '../core'
import {
  ReactSharedInternals,
  REACT_LAZY_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_PROFILER_TYPE,
} from '../react'
import { createHostNode, setProp } from './dom'
import { makeDispatcher } from './dispatcher'
import {
  adoptHostDom,
  adoptTextDom,
  setHydrationCursor,
  getHydrationCursor,
  clearHydrationCursor,
  findHostParent as findHydrationHost,
  abortHydration,
  recoverHydration,
} from './features/hydration'

// ---------------------------------------------------------------------------
// Render scheduling
// ---------------------------------------------------------------------------

let currentRoot: FiberRoot | null = null
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
  if (fiber.um) return
  const root = findRoot(fiber)
  if (!root) return
  root.p.add(fiber)
  fiber.dy = true
  pendingRoots.add(root)
  if (isBatching) return
  if (!root.s) {
    root.s = true
    queueMicrotask(flushPending)
  }
}

export function flushSyncWork(fn: () => void): void {
  const wasBatching = isBatching
  isBatching = true
  try {
    fn()
  } finally {
    isBatching = wasBatching
  }
  flushPending()
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
        // Render each pending fiber from shallowest first so an ancestor's
        // cascade reaches descendants before we try to render them directly.
        // Descendants rendered via cascade still have `dy=true` (only
        // rerenderFiber clears it); when we later reach them in this loop,
        // rerenderFiber's own `if (!dy) return` is our short-circuit. We
        // previously filtered descendants of dy ancestors here, but that
        // loses updates whenever an ancestor's render doesn't actually reach
        // the descendant — e.g. React.memo bailing on equal props. Keep all
        // dy fibers and let rerenderFiber de-dupe via its dy check.
        const pending = [...root.p]
        root.p.clear()
        pending.sort((a, b) => fiberDepth(a) - fiberDepth(b))
        for (const fiber of pending) {
          try {
            rerenderFiber(fiber, root)
          } catch (error) {
            if (!recoverHydration(root, error)) throw error
            break
          }
        }
        runEffects(root)
      }
    }
  } finally {
    flushing = false
  }
}

export function discardPendingWork(root: FiberRoot): void {
  root.p.clear()
  root.s = false
  pendingRoots.delete(root)
}

function fiberDepth(fiber: Fiber): number {
  let d = 0
  let p: Fiber | null = fiber.parent
  while (p) {
    d++
    p = p.parent
  }
  return d
}

export function findRoot(fiber: Fiber): FiberRoot | null {
  let f: Fiber | null = fiber
  while (f) {
    if (f.root) return f.root
    f = f.parent
  }
  return null
}

// ---------------------------------------------------------------------------
// Entry points (called by createRoot)
// ---------------------------------------------------------------------------

export function renderRoot(root: FiberRoot, children: ReactNode): void {
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
  if (fiber.um) return
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
    renderFiber(fiber, getHostParent(fiber), getAnchor(fiber))
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
  if (isIterable(node)) {
    for (const item of node as Iterable<ReactNode>) pushChildren(item, out)
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
  else if (type === REACT_STRICT_MODE_TYPE || type === REACT_PROFILER_TYPE) tag = FiberTag.Fragment
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
  // Fast path: unkeyed positional steady-state. Walk the existing sibling
  // chain and newChildren in lockstep, validating AND committing in one pass.
  // On any divergence we fall back to the slow path, which rebuilds the
  // sibling chain anyway — partial pp writes are idempotent.
  // Skips the Map / Set / existing-array allocation entirely.
  if (!currentRoot?.h) {
    let f: Fiber | null = parent.child
    let ok = true
    for (let i = 0; i < newChildren.length; i++) {
      const child = newChildren[i]
      if (child == null || !f || f.key != null) { ok = false; break }
      if (typeof child === 'string') {
        if (f.tag !== FiberTag.Text) { ok = false; break }
        f.pp = child
      } else {
        if ((child as ReactElement).key != null) { ok = false; break }
        if (f.type !== (child as ReactElement).type) { ok = false; break }
        f.pp = (child as ReactElement).props
        f.ref = (child as any).ref ?? null
      }
      f = f.sibling
    }
    if (ok && f === null) {
      // Pass 2: render forward with per-child anchors. Identical to the slow
      // path's pass 2.
      for (let r: Fiber | null = parent.child; r; r = r.sibling) {
        let a = anchor
        for (let s: Fiber | null = r.sibling; s; s = s.sibling) {
          const d = firstDomNode(s)
          if (d && d.parentNode === domParent) { a = d; break }
        }
        renderFiber(r, domParent, a)
      }
      return
    }
  }

  const existing = collectChildren(parent)
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
        if (claimed.has(cand) || cand.key != null) {
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
  // forward with the correct per-child anchor. During hydration the cursor
  // walks DOM forward and each renderFiber adopts the next existing node,
  // so per-child anchors are moot — fall back to the parent's anchor.
  const hydrating = !!currentRoot?.h
  for (let f: Fiber | null = parent.child; f; f = f.sibling) {
    let a = anchor
    if (!hydrating) {
      // Find the firstDomNode of the next still-mounted sibling, if any.
      for (let s: Fiber | null = f.sibling; s; s = s.sibling) {
        const d = firstDomNode(s)
        if (d && d.parentNode === domParent) { a = d; break }
      }
    }
    renderFiber(f, domParent, a)
  }

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
    // Leftover keyed
    for (const f of keyed.values()) {
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

function placeChildrenInOrder(parent: Fiber, domParent: Node, anchor: Node | null): void {
  const doms: Node[] = []
  let c = parent.child
  while (c) {
    collectHostDoms(c, doms)
    c = c.sibling
  }

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
      while (current && !doms.includes(current as Node)) {
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
registerRenderer(FiberTag.Function, renderFunction)
registerRenderer(FiberTag.Fragment, renderFragment)

export function renderFiber(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const fn = RENDERERS[fiber.tag]
  if (fn) fn(fiber, domParent, anchor)
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
  } else {
    // Past the fast path, and adoptTextDom already realigned `.data` on
    // hydration — `.data !== text` here is guaranteed, so write directly.
    ;(fiber.dom as Text).data = text
  }
  fiber.mp = text
  // dy cleared at rerender start; leaving true lets mid-render schedule persist
}

function renderHost(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const props = fiber.pp ?? {}
  const prev = fiber.mp ?? {}
  const type = fiber.type as string
  const isSvg = type === 'svg' || (domParent as Element).namespaceURI === 'http://www.w3.org/2000/svg'

  // <select value> must be applied AFTER children mount — setting `.value`
  // on a `<select>` with no matching `<option>` yet resets it to empty. Same
  // for `defaultValue` on first mount. Stash and replay.
  const isSelect = type === 'select'
  const deferredSelectValue =
    isSelect && (props.value !== undefined || props.defaultValue !== undefined)
      ? props.value !== undefined ? props.value : props.defaultValue
      : undefined

  if (!fiber.dom) {
    const hydrated = currentRoot?.h ? adoptHostDom(fiber, fiber.parent!) : false
    if (!hydrated) {
      fiber.dom = createHostNode(type, isSvg)
      // Two passes so form-control attributes (notably <input type>) are in
      // place before event handlers attach. setEventHandler reads the
      // element's runtime state to decide the DOM event name (e.g. onChange
      // → `input` vs `change`); binding before `type` is applied would
      // attach to the wrong event for checkbox/radio/file inputs.
      for (const k in props) {
        if (isSelect && (k === 'value' || k === 'defaultValue')) continue
        if (isEventProp(k)) continue
        setProp(fiber.dom as Element, k, props[k], undefined, isSvg)
      }
      for (const k in props) {
        if (!isEventProp(k)) continue
        setProp(fiber.dom as Element, k, props[k], undefined, isSvg)
      }
      insertInto(domParent, fiber.dom, anchor)
    }
    attachRef(fiber, fiber.dom)
  } else if (prev !== props) {
    const el = fiber.dom as Element
    // Single-pass diff. Defer changed event props into a small array so the
    // `type-before-events` invariant the mount path needs (setEventHandler
    // reads `el.type` to resolve onChange→input vs change) still holds when
    // a render flips both `type` and an event handler in the same pass.
    // The vast majority of host updates have no events at all (e.g. data-*
    // attributes flipping on a stable list), so the deferred array stays
    // null and we collapse to one for-in over `props`.
    let deferredEvents: string[] | null = null
    for (const k in props) {
      if (isSelect && (k === 'value' || k === 'defaultValue')) continue
      if (isEventProp(k)) {
        if (prev[k] !== props[k]) {
          deferredEvents ||= []
          deferredEvents.push(k)
        }
        continue
      }
      if (prev[k] !== props[k]) setProp(el, k, props[k], prev[k], isSvg)
    }
    // Removals — keys present in prev but not in props.
    for (const k in prev) {
      if (!(k in props)) setProp(el, k, undefined, prev[k], isSvg)
    }
    if (deferredEvents) {
      for (let i = 0; i < deferredEvents.length; i++) {
        const k = deferredEvents[i]!
        setProp(el, k, props[k], prev[k], isSvg)
      }
    }
    syncRefIfChanged(fiber, fiber.dom)
  }

  // Children go into this DOM node
  reconcileChildren(fiber, childrenToArray(props.children), fiber.dom!, null)

  // During hydration, if after reconciling all client-expected children we
  // still have server DOM left in the cursor for this host, that's a
  // structural mismatch (server produced more than client wants). Report.
  // <head>/<html> are position-insensitive — leftover here is normal
  // (Vite dev-style injections, SSR-only scripts, etc.).
  if (currentRoot?.h) {
    const parentTag = (fiber.type as string).toLowerCase()
    const hasOpaqueHydrationChildren =
      props.dangerouslySetInnerHTML != null ||
      (parentTag === 'textarea' && (props.value != null || props.defaultValue != null))
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
          if (currentRoot.re) currentRoot.re(error)
          abortHydration(error, fiber)
        }
      }
    }
  }

  // Apply <select> value after options are mounted.
  if (isSelect && deferredSelectValue !== undefined) {
    const select = fiber.dom as HTMLSelectElement
    if (Array.isArray(deferredSelectValue)) {
      const asStrings = deferredSelectValue.map((v) => '' + v)
      for (const opt of Array.from(select.options)) {
        opt.selected = asStrings.includes(opt.value)
      }
    } else {
      select.value = '' + deferredSelectValue
    }
  }

  fiber.mp = props
  // dy cleared at rerender start; leaving true lets mid-render schedule persist
}

function renderFunction(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const prevDispatcher = ReactSharedInternals.H
  const prevFiber = ReactSharedInternals.F
  const prevHook = ReactSharedInternals.K
  const prevIndex = ReactSharedInternals.I

  ReactSharedInternals.H = makeDispatcher()
  ReactSharedInternals.F = fiber
  ReactSharedInternals.K = null
  ReactSharedInternals.I = 0

  let rendered: ReactNode
  let deferredForHydration = false
  try {
    rendered = (fiber.type as Function)(fiber.pp ?? {})
  } catch (e: any) {
    if (isThenable(e)) {
      if (deferHydration(fiber, e)) {
        deferredForHydration = true
      } else {
        CAPABILITIES.handleSuspended(fiber, e)
        rendered = null
      }
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

  if (deferredForHydration) return

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
}

const CAPABILITIES: Capabilities = {
  handleSuspended: defaultHandleSuspended,
  readContext: defaultReadContext,
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
  CAPABILITIES.handleSuspended(fiber, thenable)
}

export function handleErrorInRender(fiber: Fiber, err: any): void {
  if (currentRoot?.h) {
    abortHydration(err, fiber)
  }
  // Bubble to nearest class boundary with getDerivedStateFromError / componentDidCatch
  let f: Fiber | null = fiber.parent
  while (f) {
    if (f.tag === FiberTag.Class) {
      const Ctor = f.type as any
      const instance = f.sn
      if (Ctor.getDerivedStateFromError) {
        const update = Ctor.getDerivedStateFromError(err)
        instance.state = { ...instance.state, ...update }
      }
      if (instance.componentDidCatch) {
        try {
          instance.componentDidCatch(err, { componentStack: '' })
        } catch {}
      }
      scheduleUpdate(f)
      return
    }
    f = f.parent
  }
  // No boundary — report to root
  if (currentRoot?.ue) currentRoot.ue(err)
  else throw err
}

export function isThenable(x: any): x is Promise<any> {
  return x != null && typeof x.then == 'function'
}

// ---------------------------------------------------------------------------
// Unmount
// ---------------------------------------------------------------------------

export function unmountFiber(fiber: Fiber, domParent: Node): void {
  fiber.um = true
  // Recurse first
  let c = fiber.child
  while (c) {
    const next = c.sibling
    unmountFiber(c, fiber.tag === FiberTag.Host ? fiber.dom! : domParent)
    c = next
  }
  fiber.child = null

  // Run cu (fx + layout fx)
  if (fiber.cu) {
    for (const cleanup of fiber.cu) {
      try {
        cleanup()
      } catch (e) {
        if (currentRoot?.re) currentRoot.re(e)
      }
    }
    fiber.cu = null
  }

  if (fiber.tag === FiberTag.Class && fiber.sn?.componentWillUnmount) {
    try {
      fiber.sn.componentWillUnmount()
    } catch (e) {
      if (currentRoot?.re) currentRoot.re(e)
    }
    fiber.sn._fiber = null
    fiber.sn._enqueueUpdate = null
    fiber.sn._forceUpdate = null
  }

  // Detach ref
  if (fiber.ref) detachRef(fiber.ref)

  // Remove DOM if host
  if (fiber.tag === FiberTag.Host && fiber.dom && fiber.dom.parentNode) {
    fiber.dom.parentNode.removeChild(fiber.dom)
  } else if (fiber.tag === FiberTag.Text && fiber.dom && fiber.dom.parentNode) {
    fiber.dom.parentNode.removeChild(fiber.dom)
  }
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

const DOCUMENT_HEAD_TAGS = new Set(['base', 'link', 'meta', 'script', 'style', 'title'])

function getDocumentHeadInsertionParent(parent: Node, node: Node): HTMLHeadElement | null {
  if (parent.nodeType !== 9 || node.nodeType !== 1) return null
  const tag = (node as Element).tagName.toLowerCase()
  if (!DOCUMENT_HEAD_TAGS.has(tag)) return null
  return (parent as Document).head
}

function getHostParent(fiber: Fiber): Node {
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

function getAnchor(fiber: Fiber): Node | null {
  // Return the first DOM node that comes after this fiber within the host parent
  let f: Fiber | null = fiber.sibling
  while (f) {
    const d = firstDomNode(f)
    if (d) return d
    f = f.sibling
  }
  // Ascend
  let p = fiber.parent
  while (p && p.tag !== FiberTag.Host && p.tag !== FiberTag.Root && p.tag !== FiberTag.Portal) {
    if (p.sibling) {
      const d = firstDomNode(p.sibling)
      if (d) return d
    }
    p = p.parent
  }
  return null
}

function firstDomNode(fiber: Fiber): Node | null {
  if (fiber.tag === FiberTag.Host || fiber.tag === FiberTag.Text) return fiber.dom
  let c = fiber.child
  while (c) {
    const d = firstDomNode(c)
    if (d) return d
    c = c.sibling
  }
  return null
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

function attachRef(fiber: Fiber, value: any): void {
  const ref = fiber.ref ?? (fiber.pp?.ref ?? null)
  if (!ref) return
  if (typeof ref == 'function') {
    // Match React's commit-phase semantics: callback refs run after render
    // (during the layout/commit phase), not during render. Calling them
    // synchronously here breaks libraries that assert no event handlers run
    // during render (e.g. base-ui's useStableCallback trampoline).
    scheduleLifecycle(fiber, () => {
      const cleanup = ref(value)
      fiber.cu ||= []
      fiber.cu.push(typeof cleanup == 'function' ? cleanup : () => ref(null))
    })
  } else {
    ref.current = value
  }
}

function syncRefIfChanged(fiber: Fiber, value: any): void {
  const ref = fiber.ref ?? (fiber.pp?.ref ?? null)
  if (!ref) return
  if (typeof ref === 'object' && ref.current !== value) ref.current = value
}

function detachRef(ref: any): void {
  // Function refs are handled via fiber.cu (queued in attachRef during
  // the commit phase): the cleanup either invokes the user-returned cleanup
  // fn or calls ref(null). Calling ref(null) here would double-fire it.
  if (ref && typeof ref === 'object') {
    ref.current = null
  }
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

const pendingEffects: Array<[Fiber, Effect]> = []
const pendingLayoutEffects: Array<[Fiber, Effect]> = []
const pendingLifecycles: Array<() => void> = []

export function enqueueEffect(fiber: Fiber, effect: Effect): void {
  if (effect.t) {
    pendingLayoutEffects.push([fiber, effect])
  } else {
    pendingEffects.push([fiber, effect])
  }
}

export function scheduleLifecycle(_fiber: Fiber, fn: () => void): void {
  pendingLifecycles.push(fn)
}

export function runEffects(root: FiberRoot): void {
  // Layout fx synchronously
  while (pendingLayoutEffects.length) {
    const [fiber, effect] = pendingLayoutEffects.shift()!
    runEffect(fiber, effect, root)
  }
  // Then lifecycles
  while (pendingLifecycles.length) {
    const fn = pendingLifecycles.shift()!
    try {
      fn()
    } catch (e) {
      if (root.ce) root.ce(e)
    }
  }
  // Passive fx on microtask
  if (pendingEffects.length) {
    const batch = pendingEffects.splice(0)
    queueMicrotask(() => {
      for (const [fiber, effect] of batch) runEffect(fiber, effect, root)
    })
  }
}

function runEffect(fiber: Fiber, effect: Effect, root: FiberRoot): void {
  try {
    const cleanup = effect.c()
    if (typeof cleanup == 'function') {
      fiber.cu ||= []
      fiber.cu.push(cleanup)
    }
  } catch (e) {
    if (root.ce) root.ce(e)
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

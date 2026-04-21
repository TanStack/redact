import {
  FiberTag,
  FiberFlag,
  createFiber,
  REACT_ELEMENT_TYPE,
  REACT_LEGACY_ELEMENT_TYPE,
  REACT_FRAGMENT_TYPE,
  REACT_PROVIDER_TYPE,
  REACT_CONSUMER_TYPE,
  REACT_FORWARD_REF_TYPE,
  REACT_MEMO_TYPE,
  REACT_LAZY_TYPE,
  REACT_SUSPENSE_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_PROFILER_TYPE,
  REACT_PORTAL_TYPE,
  type Fiber,
  type FiberRoot,
  type ReactElement,
  type ReactNode,
  type Hook,
  type Effect,
} from '@tanstack/dom-core'
import { createHostNode, setProp } from './dom'
import { ReactSharedInternals } from '@tanstack/react'
import { makeDispatcher } from './dispatcher'
import {
  adoptHostDom,
  adoptTextDom,
  tryConsumeBoundary,
  advanceCursorPast,
  setHydrationCursor,
  getHydrationCursor,
  clearHydrationCursor,
  HydrationCursor,
  findHostParent as findHydrationHost,
} from './hydration'

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
  // Drop updates scheduled on already-unmounted fibers. Subscribers (router,
  // query, any external store) can fire after unmount if their cleanup was
  // missed, and letting those reach rerenderFiber mounts zombie DOM into the
  // old .parent's DOM (which stays reachable via the stale pointer).
  if (fiber.unmounted) return
  const root = findRoot(fiber)
  if (!root) return
  root.pending.add(fiber)
  fiber.dirty = true
  pendingRoots.add(root)
  if (isBatching) return
  if (!root.scheduled) {
    root.scheduled = true
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
        throw new Error('flushPending exceeded 50 iterations — suspected infinite update loop.')
      }
      const roots = [...pendingRoots]
      pendingRoots.clear()
      for (const root of roots) {
        root.scheduled = false
        // Render each pending fiber from shallowest first so an ancestor's
        // cascade reaches descendants before we try to render them directly.
        // Descendants rendered via cascade still have `dirty=true` (only
        // rerenderFiber clears it); when we later reach them in this loop,
        // rerenderFiber's own `if (!dirty) return` is our short-circuit. We
        // previously filtered descendants of dirty ancestors here, but that
        // loses updates whenever an ancestor's render doesn't actually reach
        // the descendant — e.g. React.memo bailing on equal props. Keep all
        // dirty fibers and let rerenderFiber de-dupe via its dirty check.
        const pending = [...root.pending]
        root.pending.clear()
        pending.sort((a, b) => fiberDepth(a) - fiberDepth(b))
        for (const fiber of pending) {
          rerenderFiber(fiber, root)
        }
        runEffects(root)
      }
    }
  } finally {
    flushing = false
  }
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

function findRoot(fiber: Fiber): FiberRoot | null {
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
  const rootFiber = root.current
  rootFiber.pendingProps = { children }
  currentRoot = root
  try {
    reconcileChildren(rootFiber, childrenToArray(children), root.container as Node, null)
    rootFiber.memoizedProps = rootFiber.pendingProps
    rootFiber.dirty = false
  } finally {
    currentRoot = null
  }
  runEffects(root)
}

function rerenderFiber(fiber: Fiber, root: FiberRoot): void {
  if (!fiber.dirty) return
  // Skip fibers that were unmounted between scheduling and flush. Without this,
  // the flush loop re-enters a zombie fiber whose .parent is still set; its
  // render mounts fresh DOM into the old parent's still-attached DOM (since
  // unmountFiber only clears fiber.child, not fiber.parent). Visible as route
  // content from a previous location staying on screen after nav, because a
  // pending rerender on the old route's LibraryLandingPage (unmounted during
  // Outlet's shallow-first render) still fires from root.pending.
  if (fiber.unmounted) return
  // Clear BEFORE rendering so a scheduleUpdate() triggered mid-render (e.g.
  // error boundary catching a descendant throw) marks us dirty for the next
  // flush iteration instead of being wiped out when render() completes.
  fiber.dirty = false
  currentRoot = root
  // If this rerender is resuming a hydration that was deferred by a suspension,
  // re-activate hydration mode for its duration so descendants adopt DOM
  // instead of re-creating it.
  const resumeHydration =
    fiber.memoizedState && (fiber.memoizedState as any)._pendingHydration === true
  const prevHydrating = root.hydrating
  if (resumeHydration) {
    delete (fiber.memoizedState as any)._pendingHydration
    root.hydrating = true
  }
  const prevForcing = forceRerenderingFiber
  forceRerenderingFiber = fiber
  try {
    renderFiber(fiber, getHostParent(fiber), getAnchor(fiber))
  } finally {
    forceRerenderingFiber = prevForcing
    if (resumeHydration) {
      root.hydrating = prevHydrating
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

type TextChild = { _text: string }
type NormalizedChild = ReactElement | TextChild | null

// NEVER use `'_text' in child` to distinguish text wrappers from elements.
// TanStack's RSC renderable proxies (createRscProxy with renderable: true) are
// Proxy wrappers around real React elements whose `has` trap returns `true`
// for ANY string key — so `'_text' in rscProxy` is TRUE even though the proxy
// is an element. That misidentification set a Text fiber's `pendingProps` to
// `child._text` (another chained RSC proxy), which then rendered as
// `[object Object]` when createTextNode stringified the element. React
// elements always carry `$$typeof`; our text wrapper never does — so the
// presence of `$$typeof` is the invariant we rely on.
function isTextChild(child: Exclude<NormalizedChild, null>): child is TextChild {
  return (child as any).$$typeof === undefined
}

function childrenToArray(children: ReactNode): NormalizedChild[] {
  const out: NormalizedChild[] = []
  pushChildren(children, out)
  return out
}

function pushChildren(node: ReactNode, out: NormalizedChild[]): void {
  if (node == null || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') {
    // Empty strings render no text node (matches React + the `<!-- -->`
    // separator elision on the SSR side so server/client agree).
    if (node === '') return
    out.push({ _text: '' + node })
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
    if (
      t === REACT_ELEMENT_TYPE ||
      t === REACT_LEGACY_ELEMENT_TYPE ||
      // Portals are JSX-visible elements created by createPortal(); they carry
      // REACT_PORTAL_TYPE as their $$typeof, not REACT_ELEMENT_TYPE. Dropping
      // them here means Radix/Floating-UI overlays never mount (dropdowns,
      // dialogs, tooltips) — silently broken.
      t === REACT_PORTAL_TYPE
    ) {
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
  return obj != null && typeof obj !== 'string' && typeof obj[Symbol.iterator] === 'function'
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
    f.pendingProps = child._text
    f.parent = parent
    return f
  }
  const type = child.type
  let tag: FiberTag = FiberTag.Host
  const marker = type && (type as any).$$typeof
  if (typeof type === 'string') tag = FiberTag.Host
  else if (type === REACT_FRAGMENT_TYPE) tag = FiberTag.Fragment
  else if (type === REACT_SUSPENSE_TYPE) tag = FiberTag.Suspense
  else if (type === REACT_STRICT_MODE_TYPE || type === REACT_PROFILER_TYPE) tag = FiberTag.Fragment
  else if (marker === REACT_PROVIDER_TYPE) tag = FiberTag.Provider
  else if (marker === REACT_CONSUMER_TYPE) tag = FiberTag.Consumer
  else if (marker === REACT_FORWARD_REF_TYPE) tag = FiberTag.ForwardRef
  else if (marker === REACT_MEMO_TYPE) tag = FiberTag.Memo
  else if (marker === REACT_LAZY_TYPE) tag = FiberTag.Lazy
  // Portal elements set element.type to the REACT_PORTAL_TYPE symbol directly
  // (no wrapping object), so reading `.$$typeof` on the type returns undefined
  // — the marker check never matches. Compare against the symbol itself.
  else if (type === REACT_PORTAL_TYPE) tag = FiberTag.Portal
  else if (typeof type === 'function') {
    tag = type.prototype && type.prototype.isReactComponent ? FiberTag.Class : FiberTag.Function
  }
  const f = createFiber(tag, type, child.key ?? null)
  f.ref = (child as any).ref ?? null
  f.pendingProps = child.props
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
  //               the old cursor past the mismatched fiber (it'll be unmounted
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
        // unclaimed and will be unmounted at the end.
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
        fiber.pendingProps = child._text
      } else {
        fiber.type = (child as ReactElement).type
        fiber.pendingProps = (child as ReactElement).props
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

    // Render this fiber (mount or update)
    renderFiber(fiber, domParent, anchor)
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
  const parentIsHead =
    (domParent as Element).nodeType === 1 &&
    (domParent as Element).tagName.toLowerCase() === 'head'
  if (structurallyChanged && !currentRoot?.hydrating && !parentIsHead) {
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
  // domParent AND the end anchor matches, no reorder is needed. This is the
  // common case on stable re-renders, and avoids detaching/re-attaching
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
    if (inOrder) return
  }

  // Forward-iterate and only move doms whose .nextSibling already points to
  // the correct next target (doms[i+1] or the trailing anchor). Forward order
  // minimizes unnecessary moves when the disturbance is a newly inserted
  // leading sibling: moving it to the front leaves the rest untouched. A
  // reverse pass would have to re-anchor every stable sibling after the first
  // move, cancelling their CSS transitions (observed: drawer slide animation).
  for (let i = 0; i < doms.length; i++) {
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

type RenderFn = (fiber: Fiber, domParent: Node, anchor: Node | null) => void
// Indexed by FiberTag. Relies on function-declaration hoisting: the render*
// functions below all use `function` keyword, so they're initialized before
// module code runs.
const RENDERERS: Array<RenderFn | undefined> = (() => {
  const t: Array<RenderFn | undefined> = new Array(13)
  t[FiberTag.Text] = renderText
  t[FiberTag.Host] = renderHost
  t[FiberTag.Function] = renderFunction
  t[FiberTag.Class] = renderClass
  t[FiberTag.Fragment] = renderFragment
  t[FiberTag.Provider] = renderProvider
  t[FiberTag.Consumer] = renderConsumer
  t[FiberTag.ForwardRef] = renderForwardRef
  t[FiberTag.Memo] = renderMemo
  t[FiberTag.Lazy] = renderLazy
  t[FiberTag.Suspense] = renderSuspense
  t[FiberTag.Portal] = renderPortal
  return t
})()

function renderFiber(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const fn = RENDERERS[fiber.tag]
  if (fn) fn(fiber, domParent, anchor)
}

function renderText(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const text = fiber.pendingProps as string
  if (!fiber.dom) {
    const hydrated = currentRoot?.hydrating ? adoptTextDom(fiber, fiber.parent!, text) : false
    if (!hydrated) {
      fiber.dom = document.createTextNode(text)
      insertInto(domParent, fiber.dom, anchor)
    }
  } else if ((fiber.dom as Text).data !== text) {
    ;(fiber.dom as Text).data = text
  }
  fiber.memoizedProps = text
  // dirty cleared at rerender start; leaving true lets mid-render schedule persist
}

function renderHost(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const props = fiber.pendingProps ?? {}
  const prev = fiber.memoizedProps ?? {}
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
    const hydrated = currentRoot?.hydrating ? adoptHostDom(fiber, fiber.parent!) : false
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
  } else {
    const el = fiber.dom as Element
    for (const k in prev) {
      if (!(k in props)) setProp(el, k, undefined, prev[k], isSvg)
    }
    // Non-event props first for the same reason as above: a `type` change
    // must land before we ask setEventHandler to resolve the DOM event for
    // `onChange`.
    for (const k in props) {
      if (isSelect && (k === 'value' || k === 'defaultValue')) continue
      if (isEventProp(k)) continue
      if (prev[k] !== props[k]) setProp(el, k, props[k], prev[k], isSvg)
    }
    for (const k in props) {
      if (!isEventProp(k)) continue
      if (prev[k] !== props[k]) setProp(el, k, props[k], prev[k], isSvg)
    }
    if (prev !== props) syncRefIfChanged(fiber, fiber.dom)
  }

  // Children go into this DOM node
  reconcileChildren(fiber, childrenToArray(props.children), fiber.dom!, null)

  // During hydration, if after reconciling all client-expected children we
  // still have server DOM left in the cursor for this host, that's a
  // structural mismatch (server produced more than client wants). Report.
  // <head>/<html> are position-insensitive — leftover here is normal
  // (Vite dev-style injections, SSR-only scripts, etc.).
  if (currentRoot?.hydrating) {
    const parentTag = (fiber.type as string).toLowerCase()
    if (parentTag !== 'head' && parentTag !== 'html') {
      const cursor = getHydrationCursor(fiber)
      if (cursor) {
        const leftover = cursor.remaining().filter(
          (n) => n.nodeType === 1 || n.nodeType === 3,
        )
        if (leftover.length > 0 && currentRoot.onRecoverableError) {
          currentRoot.onRecoverableError(
            new Error(
              `Hydration mismatch: server rendered ${leftover.length} extra ` +
                `${leftover.length === 1 ? 'node' : 'nodes'} inside <${parentTag}> ` +
                `that the client tree did not.`,
            ),
          )
          for (const n of leftover) n.parentNode?.removeChild(n)
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

  fiber.memoizedProps = props
  // dirty cleared at rerender start; leaving true lets mid-render schedule persist
}

function renderFunction(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const prevDispatcher = ReactSharedInternals.H
  const prevFiber = ReactSharedInternals.currentFiber
  const prevHook = ReactSharedInternals.currentHook
  const prevIndex = ReactSharedInternals.hookIndex

  ReactSharedInternals.H = makeDispatcher()
  ReactSharedInternals.currentFiber = fiber
  ReactSharedInternals.currentHook = null
  ReactSharedInternals.hookIndex = 0

  let rendered: ReactNode
  let deferredForHydration = false
  try {
    rendered = (fiber.type as Function)(fiber.pendingProps ?? {})
  } catch (e: any) {
    if (isThenable(e)) {
      if (currentRoot?.hydrating) {
        // Suspension during initial hydration. Leave the existing DOM alone
        // and preserve the in-scope hydration cursor on THIS fiber so it
        // survives the synchronous endHydration() that fires when the initial
        // hydrateRoot() call returns. When the promise settles, the fiber
        // re-renders (see rerenderFiber) with hydration re-activated and its
        // descendants adopt DOM instead of creating new nodes.
        const hostParent = findHydrationHost(fiber)
        const inheritedCursor = getHydrationCursor(hostParent)
        if (inheritedCursor) {
          setHydrationCursor(fiber, inheritedCursor)
        }
        fiber.memoizedState = {
          ...(fiber.memoizedState ?? {}),
          _pendingHydration: true,
        }
        // Mirror renderLazy's guard: mark the nearest Suspense ancestor as
        // awaiting hydration-resume, so any re-render of that Suspense (e.g.
        // rehydrateBoundary fired by $RC, or an unrelated state update from a
        // sibling) doesn't re-enter `tryChildren`, re-throw, and flip Suspense
        // into its suspended+pending path — which would unmount our deferred
        // subtree and remount a fallback on top of the SSR content. By
        // pinning the Suspense to a "hydration-suspended" no-op until our
        // resume fires, the deferred re-render owns the adoption pass.
        let sus: Fiber | null = fiber.parent
        while (sus && sus.tag !== FiberTag.Suspense) sus = sus.parent
        if (sus && sus.memoizedState) {
          ;(sus.memoizedState as any)._awaitingLazyHydration = true
        }
        const clearAwait = () => {
          if (sus && sus.memoizedState) {
            ;(sus.memoizedState as any)._awaitingLazyHydration = false
          }
          scheduleUpdate(fiber)
        }
        e.then(clearAwait, clearAwait)
        deferredForHydration = true
      } else {
        handleSuspended(fiber, e)
        rendered = null
      }
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

  if (deferredForHydration) return

  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.memoizedProps = fiber.pendingProps
  // dirty cleared at rerender start; leaving true lets mid-render schedule persist
}

function hasAncestorHydrationCursor(_fiber: Fiber): boolean {
  // Reserved for future per-Suspense-boundary hydration deferral. For now the
  // top-level hydration path is all we need to special-case.
  return false
}

function renderClass(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const Ctor = fiber.type as any
  let instance = fiber.stateNode
  const props = fiber.pendingProps ?? {}
  const isNew = !instance

  // Class contextType: read the current value of the subscribed context so
  // `this.context` reflects the nearest Provider. Evaluated every render.
  const ctxValue = Ctor.contextType ? Ctor.contextType._currentValue : undefined

  if (isNew) {
    instance = new Ctor(props, ctxValue)
    instance.props = props
    instance.context = ctxValue
    instance._fiber = fiber
    instance._enqueueUpdate = (updater: any, cb?: () => void) => {
      const next = typeof updater === 'function' ? updater(instance.state, instance.props) : updater
      if (next != null) instance.state = { ...instance.state, ...next }
      if (cb) {
        fiber.cleanups ||= []
        fiber.cleanups.push(cb)
      }
      scheduleUpdate(fiber)
    }
    instance._forceUpdate = (cb?: () => void) => {
      if (cb) {
        fiber.cleanups ||= []
        fiber.cleanups.push(cb)
      }
      scheduleUpdate(fiber)
    }
    fiber.stateNode = instance
    if (Ctor.getDerivedStateFromProps) {
      const d = Ctor.getDerivedStateFromProps(props, instance.state)
      if (d) instance.state = { ...instance.state, ...d }
    }
  } else {
    const prevProps = instance.props
    const prevState = instance.state
    // Refresh context on every render — Providers higher up may have changed.
    instance.context = ctxValue
    if (Ctor.getDerivedStateFromProps) {
      const d = Ctor.getDerivedStateFromProps(props, instance.state)
      if (d) instance.state = { ...instance.state, ...d }
    }
    if (instance.shouldComponentUpdate) {
      if (!instance.shouldComponentUpdate(props, instance.state, instance.context)) {
        instance.props = props
        fiber.memoizedProps = props
        // dirty cleared at rerender start; leaving true lets mid-render schedule persist
        // Still need to render children with previous output
        if (fiber.memoizedState?.rendered) {
          reconcileChildren(fiber, childrenToArray(fiber.memoizedState.rendered), domParent, anchor)
        }
        return
      }
    }
    instance.props = props
    // New snapshot must win over any stale one from a previous render —
    // otherwise componentDidUpdate keeps seeing the original props and can
    // ping-pong setState forever.
    fiber.memoizedState = { ...(fiber.memoizedState ?? {}), prevProps, prevState }
  }

  let rendered: ReactNode
  try {
    rendered = instance.render()
  } catch (e: any) {
    if (isThenable(e)) {
      handleSuspended(fiber, e)
      rendered = null
    } else {
      handleErrorInRender(fiber, e)
      return
    }
  }
  fiber.memoizedState = { ...(fiber.memoizedState ?? {}), rendered }

  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.memoizedProps = props
  // dirty cleared at rerender start; leaving true lets mid-render schedule persist

  // Schedule lifecycle
  if (isNew) {
    if (instance.componentDidMount) {
      scheduleLifecycle(fiber, () => instance.componentDidMount())
    }
  } else if (instance.componentDidUpdate) {
    const { prevProps, prevState } = fiber.memoizedState ?? {}
    scheduleLifecycle(fiber, () => instance.componentDidUpdate(prevProps, prevState))
  }
}

function renderFragment(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const props = fiber.pendingProps ?? {}
  reconcileChildren(fiber, childrenToArray(props.children), domParent, anchor)
  fiber.memoizedProps = props
  // dirty cleared at rerender start; leaving true lets mid-render schedule persist
}

function renderProvider(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const ctx = (fiber.type as any)._context
  const props = fiber.pendingProps ?? {}
  const prevValue = ctx._currentValue
  ctx._currentValue = props.value
  try {
    reconcileChildren(fiber, childrenToArray(props.children), domParent, anchor)
  } finally {
    ctx._currentValue = prevValue
  }
  // Also store the value on the fiber so descendants rendering later (via updates)
  // can read through by walking up.
  fiber.memoizedState = props.value
  fiber.memoizedProps = props
  // dirty cleared at rerender start; leaving true lets mid-render schedule persist
}

function renderConsumer(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const ctx = (fiber.type as any)._context
  const props = fiber.pendingProps ?? {}
  const children = props.children
  const value = readContext(fiber, ctx)
  const rendered = typeof children === 'function' ? children(value) : null
  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.memoizedProps = props
  // dirty cleared at rerender start; leaving true lets mid-render schedule persist
}

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
  // dirty cleared at rerender start; leaving true lets mid-render schedule persist
}

function renderMemo(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const { type, compare } = fiber.type as any
  const props = fiber.pendingProps ?? {}
  const prev = fiber.memoizedProps

  // Memo's prop-equality gate guards PARENT-triggered rerenders. If this
  // render is a STATE-triggered rerender of this exact fiber (hook update,
  // useSyncExternalStore notification), props haven't changed by definition —
  // bailing would swallow the state change and the subscriber never re-runs.
  // rerenderFiber tags the fiber so we skip the gate here.
  const bypassMemo = fiber === forceRerenderingFiber
  const eq = !bypassMemo && prev && (compare ? compare(prev, props) : shallowEqual(prev, props))
  if (eq) {
    // dirty cleared at rerender start; leaving true lets mid-render schedule persist
    // Re-render children with previous output (already in tree)
    return
  }

  // Determine the delegated tag based on the memoized type. `React.memo` can
  // wrap plain functions, class components, OR other special types like
  // `forwardRef`. Without the marker-based branch we'd mistreat
  // `memo(forwardRef(...))` as a Fragment and render nothing.
  let innerTag: FiberTag
  if (typeof type === 'function') {
    innerTag = type.prototype?.isReactComponent
      ? FiberTag.Class
      : FiberTag.Function
  } else if (type && typeof type === 'object') {
    const m = (type as any).$$typeof
    if (m === REACT_FORWARD_REF_TYPE) innerTag = FiberTag.ForwardRef
    else if (m === REACT_MEMO_TYPE) innerTag = FiberTag.Memo
    else if (m === REACT_LAZY_TYPE) innerTag = FiberTag.Lazy
    else innerTag = FiberTag.Fragment
  } else {
    innerTag = FiberTag.Fragment
  }

  // Swap tag and type for this render pass; this is a "delegating" render
  const savedTag = fiber.tag
  const savedType = fiber.type
  fiber.tag = innerTag
  fiber.type = type
  try {
    renderFiber(fiber, domParent, anchor)
  } finally {
    fiber.tag = savedTag
    fiber.type = savedType
  }
}

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
      if (currentRoot?.hydrating) {
        const hostParent = findHydrationHost(fiber)
        const inheritedCursor = getHydrationCursor(hostParent)
        if (inheritedCursor) {
          setHydrationCursor(fiber, inheritedCursor)
        }
        fiber.memoizedState = {
          ...(fiber.memoizedState ?? {}),
          _pendingHydration: true,
        }
        // Mark the nearest ancestor Suspense as "awaiting hydration-resume".
        // Otherwise, a subsequent post-hydration re-render of that Suspense
        // (triggered by any unrelated state change) would hit `tryChildren`,
        // the Lazy would re-throw, `handleSuspended` would flip Suspense into
        // suspended+pending, and the fallback would be mounted ON TOP of the
        // SSR-hydrated content — producing duplicate logos. By pinning state
        // to a "hydration-suspended" placeholder now, the Suspense skips its
        // children re-render until our Lazy's resume fires.
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
      reconcileChildren(fiber, [], domParent, anchor)
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

function renderSuspense(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const props = fiber.pendingProps ?? {}
  const state = (fiber.memoizedState ??= { suspended: false, pending: null as Promise<any> | null })

  // Streaming hydration: if the next DOM node is a server-emitted boundary
  // marker, route through the boundary-aware hydration path.
  if (currentRoot?.hydrating && fiber.parent && !state.hydrated) {
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
    // dirty cleared at rerender start; leaving true lets mid-render schedule persist
    return
  }

  // Attempt children — suspension is handled by handleSuspended setting state
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
    // restore parent handler (already done by pop)
    void savedHandler
  }

  if (state.suspended) {
    // Replace children with fallback
    unmountAllChildren(fiber, domParent)
    reconcileChildren(fiber, childrenToArray(props.fallback), domParent, anchor)
  }
  fiber.memoizedProps = props
  // dirty cleared at rerender start; leaving true lets mid-render schedule persist
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
    // dirty cleared at rerender start; leaving true lets mid-render schedule persist
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
  } else {
    // If the inline runtime isn't present, fall back to waiting on something
    // external to mark us dirty (nothing to do).
  }

  fiber.memoizedProps = props
  // dirty cleared at rerender start; leaving true lets mid-render schedule persist
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
  const prev = currentRoot
  currentRoot = root
  try {
    unmountAllChildren(fiber, parent)

    // Re-hydrate with real children against the now-real DOM range.
    root.hydrating = true
    const cursor = new HydrationCursor(parent, state.startMark.nextSibling, state.endMark)
    setHydrationCursor(fiber, cursor)
    reconcileChildren(fiber, childrenToArray(state.realChildren), parent, null)
    clearHydrationCursor(fiber)
    root.hydrating = false
    runEffects(root)
  } finally {
    currentRoot = prev
  }
}

function renderPortal(fiber: Fiber, _domParent: Node, _anchor: Node | null): void {
  const { children, container } = fiber.pendingProps as { children: ReactNode; container: Element }
  reconcileChildren(fiber, childrenToArray(children), container, null)
  fiber.memoizedProps = fiber.pendingProps
  // dirty cleared at rerender start; leaving true lets mid-render schedule persist
}

// ---------------------------------------------------------------------------
// Suspense / error handling
// ---------------------------------------------------------------------------

const suspendHandlerStack: Array<(t: Promise<any>) => void> = []

function handleSuspended(fiber: Fiber, thenable: Promise<any>): void {
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

function handleErrorInRender(fiber: Fiber, err: any): void {
  // Bubble to nearest class boundary with getDerivedStateFromError / componentDidCatch
  let f: Fiber | null = fiber.parent
  while (f) {
    if (f.tag === FiberTag.Class) {
      const Ctor = f.type as any
      const instance = f.stateNode
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
  if (currentRoot?.onUncaughtError) currentRoot.onUncaughtError(err)
  else throw err
}

function isThenable(x: any): x is Promise<any> {
  return x != null && typeof x.then === 'function'
}

// ---------------------------------------------------------------------------
// Unmount
// ---------------------------------------------------------------------------

function unmountFiber(fiber: Fiber, domParent: Node): void {
  fiber.unmounted = true
  // Recurse first
  let c = fiber.child
  while (c) {
    const next = c.sibling
    unmountFiber(c, fiber.tag === FiberTag.Host ? fiber.dom! : domParent)
    c = next
  }
  fiber.child = null

  // Run cleanups (effects + layout effects)
  if (fiber.cleanups) {
    for (const cleanup of fiber.cleanups) {
      try {
        cleanup()
      } catch (e) {
        if (currentRoot?.onRecoverableError) currentRoot.onRecoverableError(e)
      }
    }
    fiber.cleanups = null
  }

  if (fiber.tag === FiberTag.Class && fiber.stateNode?.componentWillUnmount) {
    try {
      fiber.stateNode.componentWillUnmount()
    } catch (e) {
      if (currentRoot?.onRecoverableError) currentRoot.onRecoverableError(e)
    }
    fiber.stateNode._fiber = null
    fiber.stateNode._enqueueUpdate = null
    fiber.stateNode._forceUpdate = null
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

function unmountAllChildren(parent: Fiber, domParent: Node): void {
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

function getHostParent(fiber: Fiber): Node {
  let p = fiber.parent
  while (p) {
    if (p.tag === FiberTag.Host) return p.dom!
    if (p.tag === FiberTag.Root)
      return (p.stateNode as Node) || (p.dom as Node) || (p.root?.container as Node)
    if (p.tag === FiberTag.Portal) {
      // Portal renders its children into the `container` prop, not into any
      // DOM element the portal fiber "owns". Read the container from the
      // portal's own props so a rerenderFiber triggered on a descendant
      // (e.g. a Floating-UI-positioned popper in a Radix Portal) finds its
      // host parent — otherwise getHostParent returns undefined and the
      // next renderHost crashes reading `.namespaceURI` on undefined.
      const props = (p.pendingProps ?? p.memoizedProps) as { container?: Element } | null
      return (props?.container as Node) || (p.stateNode as Node) || (p.dom as Node) || (p.root?.container as Node)
    }
    p = p.parent
  }
  throw new Error('No host parent found.')
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
// Context read (for useContext — walk up for nearest Provider)
// ---------------------------------------------------------------------------

export function readContext(fiber: Fiber, ctx: any): any {
  let p: Fiber | null = fiber.parent
  while (p) {
    if (p.tag === FiberTag.Provider && (p.type as any)._context === ctx) {
      return (p.pendingProps ?? p.memoizedProps)?.value
    }
    p = p.parent
  }
  return ctx._currentValue
}

// ---------------------------------------------------------------------------
// Refs
// ---------------------------------------------------------------------------

function attachRef(fiber: Fiber, value: any): void {
  const ref = fiber.ref ?? (fiber.pendingProps?.ref ?? null)
  if (!ref) return
  if (typeof ref === 'function') {
    const cleanup = ref(value)
    if (typeof cleanup === 'function') {
      fiber.cleanups ||= []
      fiber.cleanups.push(cleanup)
    } else {
      fiber.cleanups ||= []
      fiber.cleanups.push(() => ref(null))
    }
  } else {
    ref.current = value
  }
}

function syncRefIfChanged(fiber: Fiber, value: any): void {
  const ref = fiber.ref ?? (fiber.pendingProps?.ref ?? null)
  if (!ref) return
  if (typeof ref === 'object' && ref.current !== value) ref.current = value
}

function detachRef(ref: any): void {
  if (typeof ref === 'function') {
    try {
      ref(null)
    } catch {}
  } else if (ref && typeof ref === 'object') {
    ref.current = null
  }
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

const pendingEffects: Array<{ fiber: Fiber; effect: Effect }> = []
const pendingLayoutEffects: Array<{ fiber: Fiber; effect: Effect }> = []
const pendingLifecycles: Array<{ fiber: Fiber; fn: () => void }> = []

export function enqueueEffect(fiber: Fiber, effect: Effect): void {
  if (effect.tag === 'layout' || effect.tag === 'insertion') {
    pendingLayoutEffects.push({ fiber, effect })
  } else {
    pendingEffects.push({ fiber, effect })
  }
}

function scheduleLifecycle(fiber: Fiber, fn: () => void): void {
  pendingLifecycles.push({ fiber, fn })
}

export function runEffects(root: FiberRoot): void {
  // Layout effects synchronously
  while (pendingLayoutEffects.length) {
    const { fiber, effect } = pendingLayoutEffects.shift()!
    runEffect(fiber, effect, root)
  }
  // Then lifecycles
  while (pendingLifecycles.length) {
    const { fn } = pendingLifecycles.shift()!
    try {
      fn()
    } catch (e) {
      if (root.onCaughtError) root.onCaughtError(e)
    }
  }
  // Passive effects on microtask
  if (pendingEffects.length) {
    const batch = pendingEffects.splice(0)
    queueMicrotask(() => {
      for (const { fiber, effect } of batch) runEffect(fiber, effect, root)
    })
  }
}

function runEffect(fiber: Fiber, effect: Effect, root: FiberRoot): void {
  try {
    const cleanup = effect.create()
    effect.destroy = typeof cleanup === 'function' ? cleanup : undefined
    if (effect.destroy) {
      fiber.cleanups ||= []
      fiber.cleanups.push(effect.destroy)
    }
  } catch (e) {
    if (root.onCaughtError) root.onCaughtError(e)
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

function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (a[k] !== b[k]) return false
  }
  return true
}

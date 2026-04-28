import { FiberTag, type Fiber, type FiberRoot } from '../../../core'
import { setProp } from '../../dom'
import { findRoot } from '../../reconcile'

// Re-export from event-replay so all hydration concerns live behind one
// feature boundary — the plugin's stub swap strips drainReplayQueue too.
export { drainReplayQueue } from '../../event-replay'

const GUARD_WINDOW_MS = 3000

/**
 * Preserve the user's scroll position across hydration. If the user scrolled
 * between SSR paint and hydrate (common in dev where JS takes seconds to
 * load), libraries that wire scroll-restoration into a `useLayoutEffect`
 * near the root (e.g. TanStack Router) will run during our synchronous
 * hydrate and call `window.scrollTo(savedFromLastVisit)` — overwriting the
 * user's fresh scroll. We install a short-lived wrapper around scrollTo that
 * suppresses programmatic calls when a user-initiated scroll happened
 * recently. Only runs in the hydration feature — the stub skips it.
 */
export function installHydrationScrollGuard(): void {
  if (typeof window === 'undefined') return
  const w = window as any
  if (w.__tdomScrollGuardInstalled) return
  w.__tdomScrollGuardInstalled = true
  const guardStartedAt = performance.now()
  let lastUserScrollAt = 0
  let programmatic = 0
  w.__tdomScrollLog = []
  window.addEventListener(
    'scroll',
    () => {
      if (programmatic === 0) {
        lastUserScrollAt = performance.now()
        w.__tdomScrollLog.push({ t: Math.round(lastUserScrollAt), ev: 'user-scroll', y: window.scrollY })
      }
    },
    { capture: true, passive: true },
  )
  const origScrollTo = window.scrollTo.bind(window)
  window.scrollTo = function (this: any, ...args: any[]) {
    const now = performance.now()
    const inGuardWindow = now - guardStartedAt < GUARD_WINDOW_MS
    const userScrolledRecently = lastUserScrollAt > 0 && now - lastUserScrollAt < 1500
    if (inGuardWindow && userScrolledRecently) {
      w.__tdomScrollLog.push({
        t: Math.round(now),
        ev: 'suppressed',
        args: JSON.stringify(args).slice(0, 80),
        tSinceHydrate: Math.round(now - guardStartedAt),
        tSinceUserScroll: Math.round(now - lastUserScrollAt),
      })
      return
    }
    w.__tdomScrollLog.push({
      t: Math.round(now),
      ev: 'allowed',
      args: JSON.stringify(args).slice(0, 80),
      tSinceHydrate: Math.round(now - guardStartedAt),
      inGuard: inGuardWindow,
      userScrolled: userScrolledRecently,
    })
    programmatic++
    try {
      return (origScrollTo as any).apply(this, args)
    } finally {
      queueMicrotask(() => {
        programmatic = Math.max(0, programmatic - 1)
      })
    }
  }
}

/**
 * Hydration cursor: walks existing DOM children in document order so we can
 * adopt them during fiber tree construction. One cursor per host parent.
 *
 * `endBefore` scopes the cursor to a subrange — used by rehydrateBoundary()
 * so we only adopt DOM up to the closing `/$` marker for that boundary.
 */
export class HydrationCursor {
  next: ChildNode | null
  parent: Node
  endBefore: ChildNode | null
  constructor(parent: Node, start: ChildNode | null = null, endBefore: ChildNode | null = null) {
    this.parent = parent
    this.next = start ?? parent.firstChild
    this.endBefore = endBefore
  }
  takeHostNode(): ChildNode | null {
    while (this.next && this.next !== this.endBefore) {
      const n = this.next
      // Skip anything that isn't an element (1) or text (3):
      // comments (8), doctype (10), processing instructions (7), cdata (4).
      if (n.nodeType !== 1 && n.nodeType !== 3) {
        this.next = n.nextSibling
        continue
      }
      this.next = n.nextSibling
      return n
    }
    return null
  }
  /**
   * Position-insensitive lookup for head/html adoption. Scans forward past
   * non-matching nodes without removing them, matching by tag AND the key
   * attributes that identify head elements uniquely (rel/href for links,
   * name/property for meta, src for script). Non-matching nodes stay in
   * place so the SSR'd stylesheet/script order is preserved.
   */
  takeMatchingHeadElement(tag: string, props: Record<string, any>): ChildNode | null {
    const target = tag.toLowerCase()
    const keyAttrs = HEAD_KEY_ATTRS[target] ?? []
    let scan = this.parent.firstChild
    while (scan) {
      if (
        scan.nodeType === 1 &&
        (scan as Element).tagName.toLowerCase() === target &&
        headAttrsMatch(scan as Element, props, keyAttrs)
      ) {
        CLAIMED.add(scan)
        return scan
      }
      scan = scan.nextSibling
    }
    return null
  }
  remaining(): ChildNode[] {
    const out: ChildNode[] = []
    let n = this.next
    while (n && n !== this.endBefore) {
      out.push(n)
      n = n.nextSibling
    }
    return out
  }
}

const hydrationCursors = new WeakMap<Fiber, HydrationCursor>()

// Head elements that we match against server DOM by attribute signature.
const HEAD_KEY_ATTRS: Record<string, ReadonlyArray<string>> = {
  link: ['rel', 'href', 'sizes', 'type'],
  meta: ['name', 'property', 'charset', 'http-equiv'],
  script: ['src', 'type'],
  style: [],
  title: [],
}

// DOM elements already claimed by some fiber during this hydration pass.
const CLAIMED = new WeakSet<Node>()

function headAttrsMatch(
  el: Element,
  props: Record<string, any>,
  keys: ReadonlyArray<string>,
): boolean {
  if (CLAIMED.has(el)) return false
  if (keys.length === 0) return true
  for (const k of keys) {
    const propVal = props[k] ?? (k === 'http-equiv' ? props.httpEquiv : undefined)
    const elVal = el.getAttribute(k)
    // If neither defines it, skip this key; if one defines it, they must match.
    if (propVal == null && elVal == null) continue
    if (propVal == null || elVal == null) continue // tolerate missing on either side
    if (String(propVal) !== elVal) return false
  }
  // At least one matching signal must be present.
  return keys.some((k) => props[k] != null || el.hasAttribute(k))
}

export function beginHydration(root: FiberRoot): void {
  root.hydrating = true
  hydrationCursors.set(root.current, new HydrationCursor(root.container))
}

export function endHydration(root: FiberRoot): void {
  root.hydrating = false
  hydrationCursors.delete(root.current)
}

/**
 * Inspect the current cursor position for a streaming-suspense boundary
 * marker emitted by the server. Returns info + advances the cursor past the
 * marker pair (start comment + fallback/real content + end comment).
 */
export interface BoundaryInfo {
  kind: 'pending' | 'resolved'
  id: number
  startMark: Comment
  endMark: Comment
}

export function tryConsumeBoundary(parent: Fiber): BoundaryInfo | null {
  const cursor = hydrationCursors.get(findHostParent(parent))
  if (!cursor) return null
  const peek = cursor.next
  if (!peek || peek.nodeType !== 8) return null
  const data = (peek as Comment).data
  const m = /^(\$\??)(\d+)$/.exec(data)
  if (!m) return null
  const kind = m[1] === '$?' ? 'pending' : 'resolved'
  const id = Number(m[2])
  const startMark = peek as Comment
  // Advance past the start comment
  cursor.next = startMark.nextSibling
  // Locate end comment: closest <!--/$-->
  let endMark: Comment | null = null
  let scan = startMark.nextSibling
  while (scan) {
    if (scan.nodeType === 8 && (scan as Comment).data === '/$') {
      endMark = scan as Comment
      break
    }
    scan = scan.nextSibling
  }
  if (!endMark) return null
  return { kind, id, startMark, endMark }
}

export function advanceCursorPast(parent: Fiber, node: Node): void {
  const cursor = hydrationCursors.get(findHostParent(parent))
  if (!cursor) return
  cursor.next = node.nextSibling
}

export function getHydrationCursor(hostFiber: Fiber): HydrationCursor | undefined {
  return hydrationCursors.get(hostFiber)
}

export function setHydrationCursor(hostFiber: Fiber, cursor: HydrationCursor): void {
  hydrationCursors.set(hostFiber, cursor)
}

export function clearHydrationCursor(hostFiber: Fiber): void {
  hydrationCursors.delete(hostFiber)
}

/**
 * Try to adopt a DOM node for this host fiber. Returns true if adopted.
 * Attaches existing attrs/children via separate hydrate pass.
 */
export function adoptHostDom(fiber: Fiber, parent: Fiber): boolean {
  const hostParent = findHostParent(parent)
  const cursor = hydrationCursors.get(hostParent)
  if (!cursor) return false

  const tag = (fiber.type as string).toLowerCase()
  const parentEl = cursor.parent as Element
  const parentTag =
    parentEl.nodeType === 1 ? (parentEl as Element).tagName.toLowerCase() : ''
  const isHeadish = parentTag === 'head' || parentTag === 'html'

  let candidate: ChildNode | null
  if (isHeadish) {
    // Head/html children are position-insensitive — server may emit them in
    // a different order than the React tree (React 19 head hoisting, etc.).
    // Scan forward without removing non-matching nodes; match on attribute
    // signature so we don't adopt the wrong <link> and clobber its props.
    candidate = cursor.takeMatchingHeadElement(tag, fiber.pendingProps ?? {})
  } else {
    candidate = cursor.takeHostNode()
  }

  if (!candidate) {
    // Client expected a host here but the cursor is exhausted — server gave
    // fewer children than the client tree. Report the structural gap (React
    // fires `onRecoverableError` for this exact case) and let the reconciler
    // mount a fresh DOM for this fiber below.
    // Exception: <head> children are position-insensitive; a missing match
    // there means "server didn't hoist this one yet", which we silently mount.
    if (!isHeadish) onMismatch(fiber, null)
    return false
  }

  if (candidate.nodeType !== 1 || (candidate as Element).tagName.toLowerCase() !== tag) {
    // mismatch — log and re-render fresh from this point
    onMismatch(fiber, candidate)
    return false
  }
  fiber.dom = candidate
  // Apply props (attach events, sync IDL props). Don't re-set existing attrs.
  const props = fiber.pendingProps ?? {}
  const isSvg =
    tag === 'svg' ||
    ((candidate as Element).namespaceURI === 'http://www.w3.org/2000/svg' &&
      tag !== 'foreignobject')
  for (const k in props) {
    if (k === 'children') continue
    if (k[0] === 'o' && k[1] === 'n' && typeof props[k] === 'function') {
      setProp(candidate as Element, k, props[k], undefined, isSvg)
    }
    // Non-event props: trust the server HTML, skip
  }
  // Set up child cursor for this host's children
  hydrationCursors.set(fiber, new HydrationCursor(candidate))
  return true
}

export function adoptTextDom(fiber: Fiber, parent: Fiber, text: string): boolean {
  const cursor = hydrationCursors.get(findHostParent(parent))
  if (!cursor) return false
  const candidate = cursor.takeHostNode()
  if (!candidate) return false
  if (candidate.nodeType === 3) {
    if ((candidate as Text).data !== text) {
      ;(candidate as Text).data = text
    }
    fiber.dom = candidate
    return true
  }
  onMismatch(fiber, candidate)
  return false
}

export function findHostParent(fiber: Fiber): Fiber {
  let f: Fiber | null = fiber
  while (f) {
    // A fiber explicitly holding a cursor acts as a boundary for hydration
    // (e.g. Suspense with a scoped cursor during fallback/boundary hydration).
    if (hydrationCursors.has(f)) return f
    if (f.tag === FiberTag.Host || f.tag === FiberTag.Root || f.tag === FiberTag.Portal) {
      return f
    }
    f = f.parent
  }
  throw new Error('No host parent found')
}

function onMismatch(fiber: Fiber, actualNode: ChildNode | null): void {
  // For v1: log and exit hydration for this subtree. The normal reconciler
  // will create a fresh DOM node below.
  const root = findRoot(fiber)
  if (root?.onRecoverableError) {
    root.onRecoverableError(
      new Error(
        `Hydration mismatch: expected <${(fiber.type as string) ?? 'text'}> but found ${
          actualNode ? (actualNode.nodeType === 1 ? (actualNode as Element).tagName : 'text') : 'nothing'
        }.`,
      ),
    )
  }
  // Remove stale DOM if still there
  if (actualNode && actualNode.parentNode) actualNode.parentNode.removeChild(actualNode)
}

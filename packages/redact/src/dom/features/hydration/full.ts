import {
  FiberTag,
  REACT_ELEMENT_TYPE,
  type Fiber,
  type FiberRoot,
  type ReactElement,
  type ReactNode,
} from '../../../core'
import { attributeName, STRING_BOOLEAN_ATTRS } from '../../../core/attributes'
import { createHostNode, setProp } from '../../dom'
import { drainReplayQueue } from '../../event-replay'
import { discardPendingWork, findRoot, flushSyncWork, renderRoot } from '../../reconcile'
import { attachRootFiber, createFiberRoot } from '../../root-internal'

// Re-export from event-replay so all hydration concerns live behind one
// feature boundary — the plugin's stub swap strips drainReplayQueue too.
export { drainReplayQueue }

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
  if (w._r) return
  const time = Date.now
  const guardStartedAt = w._r = time()
  let lastUserScrollAt = 0
  let programmatic = false
  w.addEventListener(
    'scroll',
    () => {
      if (!programmatic) {
        lastUserScrollAt = time()
      }
    },
    { capture: true, passive: true },
  )
  const origScrollTo = w.scrollTo
  w.scrollTo = function (...args: any[]) {
    const now = time()
    if (
      now - guardStartedAt < 3000 &&
      now - lastUserScrollAt < 1500
    ) {
      return
    }
    programmatic = true
    try {
      return (origScrollTo as any).apply(w, args)
    } finally {
      queueMicrotask(() => {
        programmatic = false
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
  n: ChildNode | null
  p: Node
  e: ChildNode | null
  constructor(parent: Node, start: ChildNode | null = null, endBefore: ChildNode | null = null) {
    this.p = parent
    this.n = start ?? parent.firstChild
    this.e = endBefore
  }
  take(): ChildNode | null {
    while (this.n && this.n !== this.e) {
      const n = this.n
      // Skip anything that isn't an element (1) or text (3):
      // comments (8), doctype (10), processing instructions (7), cdata (4).
      if (n.nodeType !== 1 && n.nodeType !== 3) {
        this.n = n.nextSibling
        continue
      }
      this.n = n.nextSibling
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
  head(tag: string, props: Record<string, any>): ChildNode | null {
    const target = tag.toLowerCase()
    const keyAttrs = HEAD_KEY_ATTRS[target]
    let scan = this.p.firstChild
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
  has(): boolean {
    let n = this.n
    while (n && n !== this.e) {
      if (n.nodeType === 1 || n.nodeType === 3) return true
      n = n.nextSibling
    }
    return false
  }
}

const hydrationCursors = new WeakMap<Fiber, HydrationCursor>()
const PROD_HYDRATION_ERROR = 'Hydration mismatch.'

export interface HydrationBailoutError extends Error {
  f: Fiber | null
}

export function isHydrationBailout(error: unknown): error is HydrationBailoutError {
  return !!error && (error as any).f !== undefined
}

export function abortHydration(cause: unknown, fiber: Fiber | null = null): never {
  const error = (cause instanceof Error ? cause : new Error(PROD_HYDRATION_ERROR)) as HydrationBailoutError
  ;(error as any).f = fiber
  throw error
}

interface HydrateRootOptions {
  identifierPrefix?: string
  onRecoverableError?: (error: unknown) => void
  onCaughtError?: (error: unknown) => void
  onUncaughtError?: (error: unknown) => void
}

interface HydratedRoot {
  render(children: ReactNode): void
  unmount(): void
}

export function hydrateRootImpl(
  container: Element | Document,
  initialChildren: ReactNode,
  options: HydrateRootOptions,
): HydratedRoot {
  const target = container as any as Element | Document
  const isDocument = (container as Node).nodeType === 9
  const body = isDocument ? (target as Document).body : null
  const root = createFiberRoot(target, options)

  installHydrationScrollGuard()

  const normalizedInitialChildren =
    isDocument ? normalizeDocumentChildren(initialChildren) : initialChildren
  let hydrationError: unknown = null
  beginHydration(root)
  try {
    flushSyncWork(() => {
      renderRoot(root, normalizedInitialChildren)
    })
  } catch (e) {
    hydrationError = e
  }
  endHydration(root)

  if (hydrationError && !recoverHydration(root, hydrationError)) throw hydrationError
  drainReplayQueue()

  return {
    render(children) {
      flushSyncWork(() => {
        const normalized = isDocument ? normalizeDocumentChildren(children) : children
        renderRoot(
          root,
          root.c === body ? getStaticDocumentBodyChildren(normalized) ?? normalized : normalized,
        )
      })
    },
    unmount() {
      flushSyncWork(() => {
        renderRoot(root, null)
      })
    },
  }
}

// Head elements that we match against server DOM by attribute signature.
const HEAD_KEY_ATTRS: Record<string, ReadonlyArray<string>> = {
  link: ['rel', 'href', 'sizes', 'type'],
  meta: ['name', 'property', 'charSet', 'httpEquiv'],
  script: ['src', 'type'],
  style: ['id', 'media', 'nonce', 'title'],
}

const DOCUMENT_HEAD_TAGS = new Set(['base', 'link', 'meta', 'script', 'style', 'title'])

// DOM elements already claimed by some fiber during this hydration pass.
const CLAIMED = new WeakSet<Node>()

function headAttrsMatch(
  el: Element,
  props: Record<string, any>,
  keys: ReadonlyArray<string> | undefined,
): boolean {
  if (CLAIMED.has(el)) return false
  if (!keys) return true
  for (const k of keys) {
    const propVal = props[k]
    const elVal = el.getAttribute(attributeName(k))
    if (propVal == null && elVal == null) continue
    if (propVal == null || elVal == null || String(propVal) !== elVal) return false
  }
  return true
}

export function beginHydration(root: FiberRoot): void {
  root.ic = 0
  root.h = true
  hydrationCursors.set(root.r, new HydrationCursor(root.c))
}

export function endHydration(root: FiberRoot): void {
  root.h = false
  hydrationCursors.delete(root.r)
}

/**
 * Inspect the current cursor position for a streaming-suspense boundary
 * marker emitted by the server. Returns info + advances the cursor past the
 * marker pair (start comment + fallback/real content + end comment).
 */
export type BoundaryInfo = [0 | 1, number, Comment, Comment]

export function tryConsumeBoundary(parent: Fiber): BoundaryInfo | null {
  const cursor = hydrationCursors.get(findHostParent(parent))
  if (!cursor) return null
  const peek = cursor.n
  if (!peek || peek.nodeType !== 8) return null
  const data = (peek as Comment).data
  const m = /^(\$\??)(\d+)$/.exec(data)
  if (!m) return null
  const kind = m[1] === '$?' ? 1 : 0
  const id = Number(m[2])
  const startMark = peek as Comment
  // Advance past the start comment
  cursor.n = startMark.nextSibling
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
  return [kind, id, startMark, endMark]
}

export function advanceCursorPast(parent: Fiber, node: Node): void {
  const cursor = hydrationCursors.get(findHostParent(parent))
  if (!cursor) return
  cursor.n = node.nextSibling
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
  const documentHeadParent =
    cursor.p.nodeType === 9 && DOCUMENT_HEAD_TAGS.has(tag)
      ? (cursor.p as Document).head
      : null
  const parentEl = cursor.p as Element
  const parentTag =
    parentEl.nodeType === 1 ? (parentEl as Element).tagName.toLowerCase() : ''
  const isHeadish = parentTag === 'head' || parentTag === 'html' || !!documentHeadParent

  let candidate: ChildNode | null
  if (documentHeadParent) {
    // React 19 can project <meta>/<title>/<link> from anywhere in the tree into
    // document.head. Redact does not have that projection yet, so when a
    // document-root hydration pass sees a top-level head element, adopt it
    // from <head> rather than trying to append it beside <html>.
    candidate = new HydrationCursor(documentHeadParent).head(
      tag,
      fiber.pp ?? {},
    )
  } else if (isHeadish) {
    // Head/html children are position-insensitive — server may emit them in
    // a different order than the React tree (React 19 head hoisting, etc.).
    // Scan forward without removing non-matching nodes; match on attribute
    // signature so we don't adopt the wrong <link> and clobber its props.
    candidate = cursor.head(tag, fiber.pp ?? {})
  } else {
    candidate = cursor.take()
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
  const props = fiber.pp ?? {}
  const isSvg =
    tag === 'svg' ||
    ((candidate as Element).namespaceURI === 'http://www.w3.org/2000/svg' &&
      tag !== 'foreignobject')
  const syncHydrationProps =
    !props.suppressHydrationWarning &&
    canRecoverHydrationPropMismatch(candidate, tag)
  validateHydrationProps(fiber, candidate as Element, props, tag, isSvg)
  for (const k in props) {
    if (
      k === 'children' ||
      k === 'key' ||
      k === 'ref' ||
      k === 'suppressHydrationWarning' ||
      k === 'suppressContentEditableWarning'
    ) continue
    if (
      syncHydrationProps ||
      (k[0] === 'o' && k[1] === 'n' && typeof props[k] == 'function')
    ) {
      setProp(candidate as Element, k, props[k], undefined, isSvg)
    }
  }
  // Set up child cursor for this host's children
  hydrationCursors.set(fiber, new HydrationCursor(candidate))
  return true
}

export function adoptTextDom(fiber: Fiber, parent: Fiber, text: string): boolean {
  const cursor = hydrationCursors.get(findHostParent(parent))
  if (!cursor) return false
  const candidate = cursor.take()
  if (!candidate) {
    onMismatch(fiber, null)
    return false
  }
  if (candidate.nodeType === 3) {
    if ((candidate as Text).data !== text) {
      const recovered = failHydration(
        fiber,
        process.env.NODE_ENV !== 'production'
          ? new Error(
              `Hydration text mismatch: expected "${text}" but found "${(candidate as Text).data}".`,
            )
          : undefined,
        canRecoverHydrationPropMismatch(candidate),
      )
      if (recovered) {
        ;(candidate as Text).data = text
      }
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
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('No host parent found')
  }
  throw new Error()
}

function onMismatch(fiber: Fiber, actualNode: ChildNode | null): void {
  failHydration(
    fiber,
    process.env.NODE_ENV !== 'production'
      ? new Error(
          `Hydration mismatch: expected <${(fiber.type as string) ?? 'text'}> but found ${
            actualNode ? (actualNode.nodeType === 1 ? (actualNode as Element).tagName : 'text') : 'nothing'
          }.`,
        )
      : undefined,
  )
}

function failHydration(
  fiber: Fiber,
  error: Error = new Error(PROD_HYDRATION_ERROR),
  recoverInPlace = false,
): boolean {
  const root = findRoot(fiber)
  if (root?.re) {
    root.re(error)
  }
  if (recoverInPlace) return true
  abortHydration(error, findHostRecoveryParent(fiber) ?? fiber)
}

function canRecoverHydrationPropMismatch(node: Node, tag?: string): boolean {
  return (
    tag === 'html' ||
    tag === 'head' ||
    tag === 'body' ||
    !!node.ownerDocument?.head?.contains(node)
  )
}

function findHostRecoveryParent(fiber: Fiber): Fiber | null {
  if (fiber.tag === FiberTag.Text) {
    let directHost = fiber.parent
    while (directHost && (directHost.tag !== FiberTag.Host || !directHost.dom)) {
      directHost = directHost.parent
    }
    if (!directHost) return null
    let hasEvent
    const props = directHost.pp ?? directHost.mp
    if (props) {
      for (const k in props) {
        if (k[0] === 'o' && k[1] === 'n' && typeof props[k] == 'function') {
          hasEvent = true
        }
      }
    }
    return findNearestSafeHostAboveComposite(
      hasEvent
        ? directHost.parent
        : directHost.parent?.tag === FiberTag.Host
          ? directHost.parent
          : directHost,
    )
  }

  return findNearestSafeHostAboveComposite(fiber.parent)
}

function findNearestSafeHostAboveComposite(fiber: Fiber | null): Fiber | null {
  let host: Fiber | null = null
  let f = fiber
  while (f) {
    if (f.tag === FiberTag.Host && f.dom) {
      if (!isSafeHostRecoveryElement(f)) return null
      const parentTag = f.parent?.tag as number
      if (!host || (parentTag > FiberTag.Text && parentTag < FiberTag.Suspense)) {
        host = f
      }
    }
    f = f.parent
  }
  return host
}

function isSafeHostRecoveryElement(fiber: Fiber): boolean {
  const tag = fiber.type.toLowerCase()
  return tag !== 'html' && tag !== 'head' && tag !== 'body'
}

export function recoverHydration(root: FiberRoot, error: unknown): boolean {
  if (!isHydrationBailout(error)) return false

  let container = root.c as Element | Document
  let children = root.r.pp?.children ?? null
  const hostRecovery = getRecoverableHostChildren(error)
  if (hostRecovery) {
    container = hostRecovery[0]
    children = hostRecovery[1]
  } else if (container.nodeType === 9) {
    const bodyChildren = getRecoverableDocumentBodyChildren(error)
    if (bodyChildren != null) {
      container = (container as Document).body
      children = bodyChildren
    }
  }

  resetAfterHydrationFailure(root, container)
  try {
    flushSyncWork(() => renderRoot(root, children))
  } catch (clientError) {
    resetAfterHydrationFailure(root, container)
    throw clientError
  }
  return true
}

function resetAfterHydrationFailure(
  root: FiberRoot,
  container: Element | Document,
): void {
  discardPendingWork(root)
  clearHydrationContainer(container)
  attachRootFiber(root, container)
  root.h = false
}

function clearHydrationContainer(container: Element | Document): void {
  if (container.nodeType === 9) {
    let node = container.firstChild
    while (node) {
      const next = node.nextSibling
      if (node.nodeType !== 10 /* DOCUMENT_TYPE_NODE */) {
        container.removeChild(node)
      }
      node = next
    }
    return
  }
  ;(container as Element).textContent = ''
}

function getRecoverableHostChildren(
  error: HydrationBailoutError,
): [Element, ReactNode] | null {
  const host = error.f
  if (
    host?.tag !== FiberTag.Host ||
    !host.dom ||
    !findNearestSafeHostAboveComposite(host.parent)
  ) {
    return null
  }
  return [host.dom as Element, (host.pp ?? host.mp)?.children ?? null]
}

function getRecoverableDocumentBodyChildren(error: HydrationBailoutError): ReactNode | null {
  const bodyFiber = findBodyAncestor(error.f)
  if (!bodyFiber) return null
  return (bodyFiber.pp ?? bodyFiber.mp)?.children ?? null
}

function findBodyAncestor(fiber: Fiber | null): Fiber | null {
  let f = fiber
  while (f) {
    if (f.tag === FiberTag.Host && f.type === 'body') {
      return f === fiber ? null : f
    }
    f = f.parent
  }
  return null
}

function getStaticDocumentBodyChildren(children: ReactNode): ReactNode | null {
  const list = toChildArray(children)
  const html = list.find((child) => isHostElement(child, 'html')) as ReactElement | undefined
  if (!html) return null
  const htmlChildren = toChildArray(html.props?.children)
  const body = htmlChildren.find((child) => isHostElement(child, 'body')) as ReactElement | undefined
  return body ? body.props?.children ?? null : null
}

function normalizeDocumentChildren(children: ReactNode): ReactNode {
  const list = toChildArray(children)
  const htmlIndex = list.findIndex((child) => isHostElement(child, 'html'))
  if (htmlIndex === -1) return children

  const headNodes = list.filter(isHeadElement)
  if (headNodes.length === 0) return children

  const htmlElement = list[htmlIndex] as ReactElement
  const normalizedHtml = hoistIntoHtmlHead(htmlElement, headNodes)
  return list
    .filter((child, index) => index === htmlIndex || !isHeadElement(child))
    .map((child) => (child === htmlElement ? normalizedHtml : child))
}

function hoistIntoHtmlHead(htmlElement: ReactElement, headNodes: ReactNode[]): ReactElement {
  const htmlChildren = toChildArray(htmlElement.props?.children)
  const headIndex = htmlChildren.findIndex((child) => isHostElement(child, 'head'))
  let nextChildren: ReactNode[]

  if (headIndex === -1) {
    nextChildren = [
      createHostElement('head', { children: headNodes }),
      ...htmlChildren,
    ]
  } else {
    const headElement = htmlChildren[headIndex] as ReactElement
    const existingHeadChildren = toChildArray(headElement.props?.children)
    const nextHead = {
      ...headElement,
      props: {
        ...headElement.props,
        children: [...headNodes, ...existingHeadChildren],
      },
    }
    nextChildren = htmlChildren.map((child, index) => (index === headIndex ? nextHead : child))
  }

  return {
    ...htmlElement,
    props: {
      ...htmlElement.props,
      children: nextChildren,
    },
  }
}

function toChildArray(children: unknown): ReactNode[] {
  if (children == null || typeof children === 'boolean') return []
  if (Array.isArray(children)) return children as ReactNode[]
  if (isReactElement(children)) return [children]
  if (typeof children !== 'string' && isIterable(children)) return Array.from(children) as ReactNode[]
  return [children as ReactNode]
}

function isHeadElement(value: ReactNode): boolean {
  return isReactElement(value) && typeof value.type === 'string' && DOCUMENT_HEAD_TAGS.has(value.type)
}

function isHostElement(value: ReactNode, tag: string): boolean {
  return isReactElement(value) && value.type === tag
}

function isReactElement(value: unknown): value is ReactElement {
  return !!value && typeof value === 'object' && (value as ReactElement).$$typeof === REACT_ELEMENT_TYPE
}

function isIterable(value: unknown): value is Iterable<ReactNode> {
  return !!value && typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] == 'function'
}

function createHostElement(type: string, props: Record<string, unknown>): ReactElement {
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key: null,
    ref: null,
    props,
  }
}

function validateHydrationProps(
  fiber: Fiber,
  el: Element,
  props: Record<string, any>,
  tag: string,
  isSvg: boolean,
): void {
  if (props.suppressHydrationWarning) return

  const recoverInPlace = canRecoverHydrationPropMismatch(el, tag)
  let expected: Element | undefined

  for (const k in props) {
    const value = props[k]
    if (
      k === 'children' ||
      k === 'key' ||
      k === 'ref' ||
      k === 'suppressHydrationWarning' ||
      k === 'suppressContentEditableWarning' ||
      (k[0] === 'o' && k[1] === 'n' && typeof value == 'function')
    ) continue

    if (k === 'dangerouslySetInnerHTML') {
      let html = '' + (value?.__html ?? '')
      if (tag !== 'script' && tag !== 'style') {
        const probe = document.createElement('div')
        probe.innerHTML = html
        html = probe.innerHTML
      }
      if ((el as HTMLElement).innerHTML !== html) {
        failHydration(
          fiber,
          process.env.NODE_ENV !== 'production'
            ? new Error(`Hydration HTML mismatch inside <${tag}>.`)
            : undefined,
          recoverInPlace,
        )
      }
      continue
    }

    if (k === 'value' || k === 'defaultValue') {
      if (tag === 'select') continue
      if (tag === 'input' || tag === 'textarea') {
        if (k === 'value' || props.value == null) {
          if (value != null && (el as HTMLInputElement).value !== '' + value) {
            failHydration(
              fiber,
              process.env.NODE_ENV !== 'production'
                ? new Error(`Hydration ${tag} value mismatch on <${tag}>.`)
                : undefined,
              recoverInPlace,
            )
          }
        }
        continue
      }
    }

    if (tag === 'input' && (k === 'checked' || k === 'defaultChecked')) {
      if (k === 'checked' || props.checked == null) {
        if (value != null && (el as HTMLInputElement).checked !== !!value) {
          failHydration(
            fiber,
            process.env.NODE_ENV !== 'production'
              ? new Error(`Hydration checked mismatch on <input>.`)
              : undefined,
            recoverInPlace,
          )
        }
      }
      continue
    }

    if (tag === 'option' && k === 'selected') {
      if (value != null && (el as HTMLOptionElement).selected !== !!value) {
        failHydration(
          fiber,
          process.env.NODE_ENV !== 'production'
            ? new Error(`Hydration selected mismatch on <option>.`)
            : undefined,
          recoverInPlace,
        )
      }
      continue
    }

    if (k === 'style') {
      expected ??= createHostNode(tag, isSvg)
      setProp(expected, k, value, undefined, isSvg)
      if (
        !hydrationStylesMatch(
          (el as HTMLElement).style,
          (expected as HTMLElement).style,
        )
      ) {
        failHydration(
          fiber,
          process.env.NODE_ENV !== 'production'
            ? new Error(`Hydration style mismatch on <${tag}>.`)
            : undefined,
          recoverInPlace,
        )
      }
      continue
    }

    const attr = attributeName(k, isSvg)
    const stringifiedBoolean =
      STRING_BOOLEAN_ATTRS.has(attr) || k.startsWith('aria-') || k.startsWith('data-')

    let expectedValue: string | null
    if (value == null || (value === false && !stringifiedBoolean)) {
      expectedValue = null
    } else if (k === 'muted' && !isSvg && (tag === 'video' || tag === 'audio')) {
      // The muted property controls playback; defaultMuted reflects the SSR attribute.
      expectedValue = value ? '' : null
    } else {
      expected ??= createHostNode(tag, isSvg)
      setProp(expected, k, value, undefined, isSvg)
      expectedValue = expected.getAttribute(attr)
    }
    const actualValue = el.getAttribute(attr)
    if (expectedValue !== actualValue) {
      failHydration(
        fiber,
        process.env.NODE_ENV !== 'production'
          ? new Error(
              `Hydration attribute mismatch on <${tag}> for "${attr}": ` +
                `expected ${formatHydrationValue(expectedValue)} but found ${formatHydrationValue(actualValue)}.`,
            )
          : undefined,
        recoverInPlace,
      )
    }
  }
}

function hydrationStylesMatch(
  actual: CSSStyleDeclaration,
  expected: CSSStyleDeclaration,
): boolean {
  for (let index = 0; index < expected.length; index++) {
    const property = expected.item(index)
    if (
      actual.getPropertyValue(property) !== expected.getPropertyValue(property) ||
      actual.getPropertyPriority(property) !== expected.getPropertyPriority(property)
    ) {
      return false
    }
  }
  return true
}

function formatHydrationValue(value: string | null): string {
  return value == null ? 'nothing' : JSON.stringify(value)
}

import { isTextContent } from '../core/functions';
import { isFunction, isThenable } from '../core/functions'
import { resolveClassProps } from '../core/class-props'
import {
  REACT_FRAGMENT_TYPE,
  REACT_ELEMENT_TYPE,
  REACT_LEGACY_ELEMENT_TYPE,
  type ReactNode,
  type ReactElement,
} from '../core'
import {
  REACT_SUSPENSE_TYPE,
  REACT_CONTEXT_TYPE,
  REACT_PROVIDER_TYPE,
  REACT_CONSUMER_TYPE,
  REACT_FORWARD_REF_TYPE,
  REACT_MEMO_TYPE,
  REACT_LAZY_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_PROFILER_TYPE,
  REACT_PORTAL_TYPE,
  REACT_ACTIVITY_TYPE,
  REACT_VIEW_TRANSITION_TYPE,
} from '../react'
import {
  attrToHtml,
  escapeText,
  escapeScript,
  VOID_ELEMENTS,
} from './escape'
import {
  pushContext,
  popContext,
  snapshotContexts,
  recordHostResource,
  currentSSRFrame,
  type ContextSnapshot,
} from './dispatcher'
import { isBrowserError } from '../core/browser'
import type { ResourceScope } from './resource-hints'
import type { RenderPath } from './resource-fields'

export interface ServerErrorInfo {
  componentStack: string
}

export type BrowserBailoutCallback = (error: Error, errorInfo: ServerErrorInfo) => void

export type SuspendedBoundary = [number, ReactNode, Promise<any>, ContextSnapshot, string, number, boolean | undefined, RenderPath]

export interface WalkOptions {
  inFallback?: boolean | undefined
  emit: (chunk: string) => void
  onHead?: () => void
  onSuspend?: ((boundary: SuspendedBoundary) => void) | undefined
  onBrowserBailout?: BrowserBailoutCallback | undefined
  onError?: ((error: unknown) => unknown) | undefined
  componentStack?: string | undefined
  thrownInfo?: { componentStack?: string | undefined }
  bootstrapped?: boolean | undefined
  isBoundaryResolution?: boolean | undefined
  resourceScope?: ResourceScope | undefined
  // Shared traversal flags: SVG = 1, adjacent text = 2, picture = 4, noscript = 8, document = 16.
  // Host children restore previous flags on return or throw.
  textState?: [bits: number]
  path: RenderPath | null
}

/**
 * Synchronously walk a React node and emit HTML string pieces to `opts.emit`.
 * Suspended boundaries are emitted as fallbacks with marker IDs; if `opts.onSuspend`
 * is provided, the suspension is recorded for later streaming.
 */
export function walk(
  node: ReactNode,
  opts: Omit<WalkOptions, 'textState' | 'resourceScope' | 'path'>,
  bits = 0,
  resourceScope: ResourceScope = [],
  path: RenderPath | null = null,
): void {
  walkNode(node, { ...opts, textState: [bits], resourceScope, path })
}

// Nested selects restore the previous selection when their walk ends.
let selectValue: unknown

function optionChildText(children: unknown): string {
  // `<option>Text</option>` — if no `value` prop, the option's value is its
  // flat string/number child content. Matches DOM semantics (`option.value`
  // defaults to `textContent` when no attribute is set).
  if (isTextContent(children)) return '' + children
  if (Array.isArray(children)) return children.map(optionChildText).join('')
  return ''
}

function emitText(text: string, opts: WalkOptions): void {
  // Empty string renders no text node and doesn't start/extend a text flow —
  // skip entirely so sibling text isn't separated by a stray `<!-- -->`.
  if (text === '') return
  if (opts.textState![0] & 2) opts.emit('<!-- -->')
  opts.emit(escapeText(text))
  opts.textState![0] |= 2
}

function isElementMarker(marker: unknown): boolean {
  return marker === REACT_ELEMENT_TYPE || marker === REACT_LEGACY_ELEMENT_TYPE
}

function walkNode(node: ReactNode, opts: WalkOptions, inArray?: boolean): void {
  if (node == null || typeof node === 'boolean') return

  if (isTextContent(node)) {
    emitText('' + node, opts)
    return
  }
  if (Array.isArray(node) || isFunction((node as any)[Symbol.iterator])) {
    const parent = opts.path
    let index = 0
    for (const item of node as Iterable<ReactNode>) {
      opts.path = [parent!, index++]
      walkNode(item, opts, true)
    }
    opts.path = parent
    return
  }

  if (typeof node !== 'object') return
  const marker: unknown = (node as ReactElement).$$typeof
  if (isElementMarker(marker)) {
    const element = node as ReactElement
    if (inArray) opts.path![1] = element.key ?? opts.path![1]
    walkElement(element.type, element.props ?? {}, opts)
    return
  }

  // Raw React.lazy in the tree (RSC Flight encodes 'use client' components —
  // CodeBlock, CodeExplorer, etc. — as bare Lazy objects directly in the
  // tree, not wrapped in REACT_ELEMENT_TYPE). SSR previously dropped these
  // here, so code snippets never made it into the server HTML. The RSC
  // decoder server-side awaits payloads before rendering, so status is
  // 'fulfilled' and `_init()` returns the resolved element synchronously.
  // If still pending (shouldn't happen post-awaitLazyElements), throw the
  // thenable so streaming SSR suspends the current boundary and retries.
  if (marker === REACT_LAZY_TYPE) {
    const lazy = node as any
    const resolved = lazy._init(lazy._payload)
    walkNode(resolved, opts)
    return
  }
}

function walkElement(type: ReactElement['type'], props: Record<string, any>, opts: WalkOptions): void {

  if (typeof type === 'string') {
    walkHost(type, props, opts)
    return
  }

  if (type === REACT_FRAGMENT_TYPE || type === REACT_STRICT_MODE_TYPE || type === REACT_PROFILER_TYPE || type === REACT_VIEW_TRANSITION_TYPE) {
    walkNode(props.children, opts)
    return
  }

  if (type === REACT_SUSPENSE_TYPE) {
    walkSuspense(props, opts)
    return
  }

  if (type === REACT_ACTIVITY_TYPE) {
    if (props.mode !== 'hidden') walkNode(props.children, opts)
    return
  }

  const marker = (type as any)?.$$typeof

  if (marker === REACT_PORTAL_TYPE) {
    // Portals don't render to the main HTML output on the server.
    return
  }

  if (marker === REACT_CONTEXT_TYPE || marker === REACT_PROVIDER_TYPE) {
    const ctx = (type as any)._context
    pushContext(ctx, props.value)
    try {
      walkNode(props.children, opts)
    } finally {
      popContext(ctx)
    }
    return
  }

  if (marker === REACT_CONSUMER_TYPE) {
    const render = props.children
    if (isFunction(render)) {
      walkNode(render((type as any)._context._currentValue), opts)
    }
    return
  }

  if (marker === REACT_FORWARD_REF_TYPE) {
    const render = (type as any).render
    const ref = (props as any).ref ?? null
    const { ref: _omit, ...rest } = props as any
    walkComponent(render, rest, opts, ref)
    return
  }

  if (marker === REACT_MEMO_TYPE) {
    const inner = (type as any).type
    walkElement(inner, props, opts)
    return
  }

  if (marker === REACT_LAZY_TYPE) {
    const { _payload, _init } = type as any
    const resolved = _init(_payload)
    walkElement(resolved, props, opts)
    return
  }

  if (isFunction(type)) {
    walkComponent(type, props, opts)
    return
  }
}

function walkHost(
  tag: string,
  props: Record<string, any>,
  opts: WalkOptions,
): void {
  let emit = opts.emit
  const textState = opts.textState!
  const isSvg = !!(textState[0] & 1) || tag === 'svg'
  const flags = textState[0] & 28
  if (!isSvg) {
    const hoisted = recordHostResource(tag, props, opts.emit, opts.resourceScope!, flags, opts.path!, opts.inFallback)
    if (hoisted === true) return
    if (hoisted) {
      if (textState[0] & 2) emit('<!-- -->')
      emit = hoisted
    }
  }

  // <textarea value="..."> serializes its value as a TEXT CHILD, not an
  // attribute. `defaultValue` is the fallback when `value` is absent. This
  // matches React and the HTML spec — `<textarea value="x">` is not valid
  // HTML; the value is the element's textContent.
  const isTextarea = tag === 'textarea'
  const textareaValue = isTextarea ? props.value ?? props.defaultValue : undefined

  // <input defaultValue="..."> should parse with that value — emit it as a
  // `value` attribute. Similarly `defaultChecked` becomes `checked`. This
  // keeps hydration consistent: the browser parser sees the initial value,
  // and on client commit our setProp seeds `.defaultValue`/`.defaultChecked`
  // without stomping the user-typed value.
  const isInput = tag === 'input'
  const inputValueAttr =
    isInput && props.value == null
      ? props.defaultValue
      : undefined
  const inputCheckedAttr =
    isInput && props.checked == null
      ? props.defaultChecked
      : undefined

  // <select value="..."> does NOT become an attribute on `<select>` — the
  // HTML spec has no such attribute. React resolves the selection by stamping
  // `selected` on the matching `<option>` children during render. Stash the
  // target value(s) on the walk state and the child `<option>` walk reads it.
  const isSelect = tag === 'select'
  const previousSelect = selectValue
  if (isSelect) selectValue = props.value ?? props.defaultValue
  const isOption = tag === 'option'
  try {

  // Prepend the HTML5 doctype to the stream when rendering an <html> root.
  // Without it the browser parses the document in quirks mode, which breaks
  // CSS sizing (documentElement.clientHeight returns the content height, not
  // the viewport) — and Floating-UI-based libraries (Radix dropdowns etc.)
  // then compute off-screen positions for overlays.
  if (tag === 'html') emit('<!DOCTYPE html>')

  emit('<' + tag)
  const textValue = isTextarea || isSelect
  for (const k in props) {
    if (textValue && k === 'value' || (textValue || isInput) && k === 'defaultValue' ||
        isInput && k === 'defaultChecked' || isOption && k === 'selected') continue
    emit(attrToHtml(k, props[k], isSvg))
  }
  if (inputValueAttr != null) {
    emit(attrToHtml('value', inputValueAttr, isSvg))
  }
  if (inputCheckedAttr != null) {
    emit(attrToHtml('checked', inputCheckedAttr, isSvg))
  }
  if (isOption) {
    const selectVal = selectValue
    if (selectVal !== undefined) {
      const optionValue =
        props.value != null ? props.value : optionChildText(props.children)
      const matches = Array.isArray(selectVal)
        ? selectVal.some((v) => '' + v === '' + optionValue)
        : '' + selectVal === '' + optionValue
      if (matches) emit(' selected=""')
    } else if (props.selected) {
      emit(' selected=""')
    }
  }

  if (VOID_ELEMENTS.test(tag)) {
    emit('/>')
    textState[0] &= ~2
    return
  }
  emit('>')
  if (tag === 'head') opts.onHead?.()
  // Opening a host element starts a fresh text flow context for its children.
  // Children's text separator tracking is independent of the outer context.

  if (tag === 'html' && !hasHeadChild(props.children)) {
    emit('<head>')
    opts.onHead?.()
    emit('</head>')
  }

  const dangerouslyHtml = props.dangerouslySetInnerHTML?.__html

  if (isTextarea && textareaValue != null) {
    emit(escapeText(String(textareaValue)))
  } else if (tag === 'script' || tag === 'style') {
    // script/style: raw-text. React allows either a string/number child or
    // dangerouslySetInnerHTML — some libs (Start's Scripts) use the latter.
    const content = dangerouslyHtml ?? props.children
    if (dangerouslyHtml != null || typeof content === 'string' || typeof content === 'number') {
      emit(escapeScript(String(content)))
    } else if (Array.isArray(content)) {
      emit(escapeScript(content.filter(child => child != null).join('')))
    }
  } else if (dangerouslyHtml != null) {
    emit(String(dangerouslyHtml))
  } else {
    const previousState = textState[0]
    textState[0] = flags | +(isSvg && tag !== 'foreignObject') |
      (tag === 'picture' ? 4 : tag === 'noscript' ? 8 : tag === 'html' ? 16 : 0)
    try {
      walkNode(props.children, opts)
    } finally {
      textState[0] = previousState
    }
  }
  emit(`</${tag}>`)
  // Host element closing resets outer flow — next sibling text starts fresh.
  textState[0] &= ~2
  } finally {
    if (isSelect) selectValue = previousSelect
  }
}

function hasHeadChild(children: unknown): boolean {
  if (children == null || typeof children === 'boolean') return false
  if (Array.isArray(children)) return children.some(hasHeadChild)
  if (typeof children !== 'string' && isFunction((children as any)[Symbol.iterator])) {
    for (const child of children as Iterable<unknown>) {
      if (hasHeadChild(child)) return true
    }
    return false
  }
  return typeof children === 'object' && isElementMarker((children as ReactElement).$$typeof) && (children as ReactElement).type === 'head'
}

function walkComponent(
  fn: Function,
  props: Record<string, any>,
  opts: WalkOptions,
  ref?: unknown,
): void {
  if (opts.onBrowserBailout) {
    opts = { ...opts, componentStack: `\n    at ${(fn as any).displayName || fn.name || 'Anonymous'}${opts.componentStack || ''}` }
  }
  try {
    let rendered: ReactNode
    if ((fn as any).prototype?.isReactComponent) {
      props = resolveClassProps(fn, props)
      const ctxValue = (fn as any).contextType?._currentValue
      const instance = new (fn as any)(props, ctxValue)
      instance.props = props
      instance.context = ctxValue
      if ((fn as any).getDerivedStateFromProps) {
        const d = (fn as any).getDerivedStateFromProps(props, instance.state)
        if (d) instance.state = { ...instance.state, ...d }
      }
      rendered = instance.render()
    } else {
      rendered = (fn as any)(props, ref)
    }
    walkNode(rendered, opts)
  } catch (error) {
    if (opts.thrownInfo && !opts.thrownInfo.componentStack) opts.thrownInfo.componentStack = opts.componentStack
    if (isBrowserError(error) && !(error as any).componentStack) {
      Object.defineProperty(error, 'componentStack', { value: opts.componentStack })
    }
    throw error
  }
}

function emitBuffered(parts: string[], head: number, opts: WalkOptions): void {
  if (head >= 0) {
    const tail = parts.splice(head)
    opts.emit(parts.join(''))
    opts.onHead?.()
    parts = tail
  }
  opts.emit(parts.join(''))
}

function walkSuspense(
  props: Record<string, any>,
  opts: WalkOptions,
): void {
  const frame = currentSSRFrame()
  const id = frame.nextId++
  // Snapshot contexts BEFORE attempting children, so if a descendant suspends
  // we can replay the same provider stack when re-rendering the boundary.
  const contextSnapshot = snapshotContexts()

  // Try to render the children synchronously. If a thenable is thrown,
  // record the boundary and emit the fallback.
  const parts: string[] = []
  let head = -1
  const nested: SuspendedBoundary[] = []
  const thrownInfo: { componentStack?: string | undefined } = {}
  // Mark the boundary so a nested single child has its own render address.
  const path: RenderPath = [opts.path!, -1]
  const resourceScope: ResourceScope = []
  const buffered = {
    ...opts,
    emit: (chunk: string) => parts.push(chunk),
    onHead: () => { head = parts.length },
    onSuspend: opts.onSuspend ? (boundary: SuspendedBoundary) => nested.push(boundary) : undefined,
  }
  let marker = ''
  let pending: Promise<any> | undefined
  try {
    walkNode(props.children, { ...buffered, resourceScope, thrownInfo, path })
  } catch (error: any) {
    nested.length = parts.length = 0
    head = -1
    if (isThenable(error)) {
      pending = error
      marker = '?'
    } else if (isBrowserError(error)) {
      opts.onBrowserBailout?.(error, { componentStack: (error as any).componentStack || opts.componentStack || '' })
      marker = '!'
    } else {
      opts.onError?.(error)
      marker = 'E'
    }
    walkNode(props.fallback, { ...buffered, inFallback: true })
  }

  if (!marker) frame.resources?.mergeScope(resourceScope, opts.resourceScope)

  // Keep the boundary markers even when its contents resolve on the first pass.
  // Hydration uses them to locate the existing range.
  opts.emit(`<!--$${marker}${id}-->`)
  if (pending) opts.emit(`<div id="B:${id}">`)
  emitBuffered(parts, head, opts)
  if (pending) opts.emit('</div>')
  opts.emit('<!--/$-->')
  for (const boundary of nested) opts.onSuspend?.(boundary)
  if (pending) opts.onSuspend?.([
    id, props.children, pending, contextSnapshot,
    thrownInfo.componentStack || opts.componentStack || '',
    opts.textState![0] & 28, opts.inFallback, path,
  ])
}

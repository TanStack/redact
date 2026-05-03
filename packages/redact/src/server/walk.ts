import {
  REACT_ELEMENT_TYPE,
  REACT_LEGACY_ELEMENT_TYPE,
  REACT_FRAGMENT_TYPE,
  type ReactNode,
  type ReactElement,
} from '../core'
import {
  REACT_SUSPENSE_TYPE,
  REACT_PROVIDER_TYPE,
  REACT_CONSUMER_TYPE,
  REACT_FORWARD_REF_TYPE,
  REACT_MEMO_TYPE,
  REACT_LAZY_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_PROFILER_TYPE,
  REACT_PORTAL_TYPE,
} from '../react'
import {
  attrToHtml,
  escapeText,
  escapeScript,
  VOID_ELEMENTS,
  RAW_TEXT_ELEMENTS,
} from './escape'
import {
  pushContext,
  popContext,
  snapshotContexts,
  type ContextSnapshot,
} from './dispatcher'

export interface SuspendedBoundary {
  id: number
  fallbackHTML: string
  children: ReactNode
  thenable: Promise<any>
  contextSnapshot: ContextSnapshot
}

export interface WalkOptions {
  emit: (chunk: string) => void
  onSuspend?: ((boundary: SuspendedBoundary) => void) | undefined
  nextBoundaryId: () => number
  bootstrapped?: boolean | undefined
  isBoundaryResolution?: boolean | undefined
  /**
   * Tracks whether the most recent emission within the *current text flow*
   * ended with a text node. When the next emission is also text, we emit a
   * `<!-- -->` separator so the browser's HTML parser doesn't merge them
   * into a single text node — required for hydration to line up text
   * boundaries with the React tree. Reset to `false` whenever we enter a
   * new host element (`<tag>` opens a fresh text flow).
   */
  textState?: { lastWasText: boolean }
}

/**
 * Synchronously walk a React node and emit HTML string pieces to `opts.emit`.
 * Suspended boundaries are emitted as fallbacks with marker IDs; if `opts.onSuspend`
 * is provided, the suspension is recorded for later streaming.
 */
export function walk(node: ReactNode, opts: WalkOptions): void {
  // Seed a text state if the caller didn't provide one so the separator logic
  // is active for the whole tree.
  if (!opts.textState) opts = { ...opts, textState: { lastWasText: false } }
  walkNode(node, opts)
}

// --- <select> selection context ----------------------------------------------
// Stack of active select values (or `undefined` when the current select has
// no controlled value). `<option>` walks read the top of stack to decide
// whether to emit `selected=""`.
const selectValueStack: unknown[] = []
function pushSelectContext(value: unknown): void {
  selectValueStack.push(value)
}
function popSelectContext(): void {
  selectValueStack.pop()
}
function currentSelectValue(): unknown {
  return selectValueStack.length ? selectValueStack[selectValueStack.length - 1] : undefined
}

function optionChildText(children: unknown): string {
  // `<option>Text</option>` — if no `value` prop, the option's value is its
  // flat string/number child content. Matches DOM semantics (`option.value`
  // defaults to `textContent` when no attribute is set).
  if (children == null) return ''
  if (typeof children === 'string' || typeof children === 'number') return '' + children
  if (Array.isArray(children)) return children.map(optionChildText).join('')
  return ''
}

function emitText(text: string, opts: WalkOptions): void {
  // Empty string renders no text node and doesn't start/extend a text flow —
  // skip entirely so sibling text isn't separated by a stray `<!-- -->`.
  if (text === '') return
  if (opts.textState?.lastWasText) opts.emit('<!-- -->')
  opts.emit(escapeText(text))
  if (opts.textState) opts.textState.lastWasText = true
}

function walkNode(node: ReactNode, opts: WalkOptions): void {
  if (node == null || node === false || node === true) return

  if (typeof node === 'string') {
    emitText(node, opts)
    return
  }
  if (typeof node === 'number') {
    emitText(String(node), opts)
    return
  }
  if (Array.isArray(node)) {
    for (const c of node) walkNode(c, opts)
    return
  }
  if (typeof (node as any)[Symbol.iterator] === 'function') {
    for (const item of node as Iterable<ReactNode>) walkNode(item, opts)
    return
  }

  if (typeof node !== 'object') return
  const t = (node as any).$$typeof

  // Raw React.lazy in the tree (RSC Flight encodes 'use client' components —
  // CodeBlock, CodeExplorer, etc. — as bare Lazy objects directly in the
  // tree, not wrapped in REACT_ELEMENT_TYPE). SSR previously dropped these
  // here, so code snippets never made it into the server HTML. The RSC
  // decoder server-side awaits payloads before rendering, so status is
  // 'fulfilled' and `_init()` returns the resolved element synchronously.
  // If still pending (shouldn't happen post-awaitLazyElements), throw the
  // thenable so streaming SSR suspends the current boundary and retries.
  if (t === REACT_LAZY_TYPE) {
    const lazy = node as any
    const resolved = lazy._init(lazy._payload)
    walkNode(resolved, opts)
    return
  }

  if (t !== REACT_ELEMENT_TYPE && t !== REACT_LEGACY_ELEMENT_TYPE) return

  const el = node as ReactElement
  walkElement(el, opts)
}

function walkElement(el: ReactElement, opts: WalkOptions): void {
  const type = el.type
  const props = el.props ?? {}

  if (type === REACT_FRAGMENT_TYPE || type === REACT_STRICT_MODE_TYPE || type === REACT_PROFILER_TYPE) {
    walkNode(props.children, opts)
    return
  }

  if (type === REACT_SUSPENSE_TYPE) {
    walkSuspense(props, opts)
    return
  }

  if (typeof type === 'string') {
    walkHost(type, props, opts)
    return
  }

  const marker = (type as any)?.$$typeof

  if (marker === REACT_PORTAL_TYPE) {
    // Portals don't render to the main HTML output on the server.
    return
  }

  if (marker === REACT_PROVIDER_TYPE) {
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
    const ctx = (type as any)._context
    const render = props.children
    if (typeof render === 'function') {
      walkNode(render(ctx._currentValue), opts)
    }
    return
  }

  if (marker === REACT_FORWARD_REF_TYPE) {
    const render = (type as any).render
    const ref = (props as any).ref ?? null
    const { ref: _omit, ...rest } = props as any
    const rendered = render(rest, ref)
    walkNode(rendered, opts)
    return
  }

  if (marker === REACT_MEMO_TYPE) {
    const inner = (type as any).type
    walkElement({ ...el, type: inner } as ReactElement, opts)
    return
  }

  if (marker === REACT_LAZY_TYPE) {
    const { _payload, _init } = type as any
    try {
      const resolved = _init(_payload)
      walkElement({ ...el, type: resolved } as ReactElement, opts)
    } catch (thenable: any) {
      if (isThenable(thenable)) {
        // Suspend this point
        throw thenable
      }
      throw thenable
    }
    return
  }

  if (typeof type === 'function') {
    walkComponent(type, props, opts)
    return
  }
}

function walkHost(
  tag: string,
  props: Record<string, any>,
  opts: WalkOptions,
): void {
  // <textarea value="..."> serializes its value as a TEXT CHILD, not an
  // attribute. `defaultValue` is the fallback when `value` is absent. This
  // matches React and the HTML spec — `<textarea value="x">` is not valid
  // HTML; the value is the element's textContent.
  const isTextarea = tag === 'textarea'
  const textareaValue = isTextarea
    ? props.value != null
      ? props.value
      : props.defaultValue
    : undefined

  // <input defaultValue="..."> should parse with that value — emit it as a
  // `value` attribute. Similarly `defaultChecked` becomes `checked`. This
  // keeps hydration consistent: the browser parser sees the initial value,
  // and on client commit our setProp seeds `.defaultValue`/`.defaultChecked`
  // without stomping the user-typed value.
  const isInput = tag === 'input'
  const inputValueAttr =
    isInput && props.value == null && props.defaultValue != null
      ? props.defaultValue
      : undefined
  const inputCheckedAttr =
    isInput && props.checked == null && props.defaultChecked != null
      ? props.defaultChecked
      : undefined

  // <select value="..."> does NOT become an attribute on `<select>` — the
  // HTML spec has no such attribute. React resolves the selection by stamping
  // `selected` on the matching `<option>` children during render. Stash the
  // target value(s) on the walk state and the child `<option>` walk reads it.
  const isSelect = tag === 'select'
  if (isSelect) {
    const val = props.value != null ? props.value : props.defaultValue
    pushSelectContext(val)
  }
  const isOption = tag === 'option'

  // Prepend the HTML5 doctype to the stream when rendering an <html> root.
  // Without it the browser parses the document in quirks mode, which breaks
  // CSS sizing (documentElement.clientHeight returns the content height, not
  // the viewport) — and Floating-UI-based libraries (Radix dropdowns etc.)
  // then compute off-screen positions for overlays.
  if (tag === 'html') opts.emit('<!DOCTYPE html>')

  opts.emit('<' + tag)
  for (const k in props) {
    if (isTextarea && (k === 'value' || k === 'defaultValue')) continue
    if (isInput && (k === 'defaultValue' || k === 'defaultChecked')) continue
    if (isSelect && (k === 'value' || k === 'defaultValue')) continue
    if (isOption && k === 'selected') continue
    opts.emit(attrToHtml(k, props[k]))
  }
  if (inputValueAttr !== undefined) {
    opts.emit(attrToHtml('value', inputValueAttr))
  }
  if (inputCheckedAttr !== undefined) {
    opts.emit(attrToHtml('checked', inputCheckedAttr))
  }
  if (isOption) {
    const selectVal = currentSelectValue()
    if (selectVal !== undefined) {
      const optionValue =
        props.value != null ? props.value : optionChildText(props.children)
      const matches = Array.isArray(selectVal)
        ? selectVal.some((v) => '' + v === '' + optionValue)
        : '' + selectVal === '' + optionValue
      if (matches) opts.emit(' selected=""')
    } else if (props.selected) {
      opts.emit(' selected=""')
    }
  }

  if (VOID_ELEMENTS.has(tag)) {
    opts.emit('/>')
    if (opts.textState) opts.textState.lastWasText = false
    return
  }
  opts.emit('>')
  // Opening a host element starts a fresh text flow context for its children.
  // Children's text separator tracking is independent of the outer context.
  const parentTextState = opts.textState
  const childOpts: WalkOptions = { ...opts, textState: { lastWasText: false } }

  const dangerouslyHtml = props.dangerouslySetInnerHTML?.__html

  if (isTextarea && textareaValue != null) {
    opts.emit(escapeText(String(textareaValue)))
    opts.emit(`</${tag}>`)
    if (parentTextState) parentTextState.lastWasText = false
    return
  }

  if (RAW_TEXT_ELEMENTS.has(tag)) {
    // script/style: raw-text. React allows either a string/number child or
    // dangerouslySetInnerHTML — some libs (Start's Scripts) use the latter.
    if (dangerouslyHtml != null) {
      opts.emit(escapeScript(String(dangerouslyHtml)))
    } else {
      const children = props.children
      if (typeof children === 'string' || typeof children === 'number') {
        opts.emit(escapeScript(String(children)))
      } else if (Array.isArray(children)) {
        opts.emit(escapeScript(children.filter((c) => c != null).join('')))
      }
    }
    opts.emit(`</${tag}>`)
    if (parentTextState) parentTextState.lastWasText = false
    return
  }

  if (dangerouslyHtml != null) {
    opts.emit(String(dangerouslyHtml))
  } else {
    walkNode(props.children, childOpts)
  }
  opts.emit(`</${tag}>`)
  if (isSelect) popSelectContext()
  // Host element closing resets outer flow — next sibling text starts fresh.
  if (parentTextState) parentTextState.lastWasText = false
}

function walkComponent(
  fn: Function,
  props: Record<string, any>,
  opts: WalkOptions,
): void {
  if ((fn as any).prototype?.isReactComponent) {
    const ctxType = (fn as any).contextType
    const ctxValue = ctxType ? ctxType._currentValue : undefined
    const instance = new (fn as any)(props, ctxValue)
    instance.props = props
    instance.context = ctxValue
    if ((fn as any).getDerivedStateFromProps) {
      const d = (fn as any).getDerivedStateFromProps(props, instance.state)
      if (d) instance.state = { ...instance.state, ...d }
    }
    walkNode(instance.render(), opts)
    return
  }
  const rendered = (fn as any)(props)
  walkNode(rendered, opts)
}

function walkSuspense(
  props: Record<string, any>,
  opts: WalkOptions,
): void {
  const id = opts.nextBoundaryId()
  // Snapshot contexts BEFORE attempting children, so if a descendant suspends
  // we can replay the same provider stack when re-rendering the boundary.
  const contextSnapshot = snapshotContexts()

  // Try to render the children synchronously. If a thenable is thrown,
  // record the boundary and emit the fallback.
  const childParts: string[] = []
  const childEmit = (s: string) => childParts.push(s)
  try {
    walkNode(props.children, {
      emit: childEmit,
      onSuspend: opts.onSuspend,
      nextBoundaryId: opts.nextBoundaryId,
    })
  } catch (thenable: any) {
    if (isThenable(thenable)) {
      const fallbackParts: string[] = []
      try {
        walkNode(props.fallback, {
          emit: (s) => fallbackParts.push(s),
          onSuspend: opts.onSuspend,
          nextBoundaryId: opts.nextBoundaryId,
        })
      } catch {
        // Fallback suspending is unsupported; emit nothing
      }
      emitBoundary(opts, id, fallbackParts.join(''))

      if (opts.onSuspend) {
        opts.onSuspend({
          id,
          fallbackHTML: fallbackParts.join(''),
          children: props.children,
          thenable,
          contextSnapshot,
        })
      }
      return
    }
    throw thenable
  }

  // Children rendered fully — emit them wrapped in resolved-boundary markers
  // (`<!--$N-->` / `<!--/$-->`). Without markers, the client hydrator has no
  // way to know this subtree is inside a Suspense, so if the client version
  // of a descendant (e.g. `React.lazy`) suspends it can't pinpoint which DOM
  // range to adopt on resolve — it creates fresh DOM next to the SSR content,
  // producing visible duplicates (e.g. double navbar logos). Markers let the
  // client treat this as a resolved boundary and hydrate in-place.
  opts.emit(`<!--$${id}-->`)
  opts.emit(childParts.join(''))
  opts.emit(`<!--/$-->`)
}

function emitBoundary(opts: WalkOptions, id: number, fallbackHTML: string): void {
  // Visible div wrapper so the fallback UI shows; B: id lets $RC locate it on
  // reveal. The leading/trailing comments let hydration detect a pending
  // boundary and register a reveal callback.
  opts.emit(`<!--$?${id}--><div id="B:${id}">`)
  opts.emit(fallbackHTML)
  opts.emit(`</div><!--/$-->`)
}

function isThenable(x: any): x is Promise<any> {
  return x != null && typeof x.then === 'function'
}

const SVG_NS = 'http://www.w3.org/2000/svg'

const BOOLEAN_ATTRS = new Set([
  'allowfullscreen',
  'async',
  'autofocus',
  'autoplay',
  'checked',
  'controls',
  'default',
  'defer',
  'disabled',
  'formnovalidate',
  'hidden',
  'inert',
  'ismap',
  'itemscope',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
])

const IDL_ATTRS = new Set([
  'value',
  'checked',
  'selected',
  'disabled',
  'multiple',
  'muted',
  'readonly',
  'contentEditable',
  'spellcheck',
  'draggable',
])

export function createHostNode(type: string, isSvg: boolean): Element {
  if (isSvg || type === 'svg') {
    return document.createElementNS(SVG_NS, type)
  }
  return document.createElement(type)
}

export function isSvgElement(el: Element): boolean {
  return (el as any).ownerSVGElement !== undefined || el.tagName === 'svg'
}

export function setProp(
  el: Element,
  name: string,
  next: any,
  prev: any,
  isSvg: boolean,
): void {
  if (name === 'children' || name === 'key' || name === 'ref') return

  // defaultValue / defaultChecked are IDL-property-only — they seed the
  // initial value/checked of a form control on first mount and must NOT be
  // emitted as HTML attributes (which would leak as `defaultValue="..."`).
  // Setting `el.defaultValue` on a fresh control also sets the initial
  // `el.value`, which is what consumers expect. Skip on hydrated DOM so we
  // don't clobber a live user-typed value.
  if (name === 'defaultValue' || name === 'defaultChecked') {
    if (prev === undefined && next != null) {
      try {
        ;(el as any)[name] = next
      } catch {}
    }
    return
  }

  if (name === 'className') {
    if (isSvg) {
      if (next == null) el.removeAttribute('class')
      else el.setAttribute('class', '' + next)
    } else {
      ;(el as HTMLElement).className = next == null ? '' : '' + next
    }
    return
  }

  if (name === 'class') {
    if (next == null) el.removeAttribute('class')
    else el.setAttribute('class', '' + next)
    return
  }

  if (name === 'style') {
    setStyle(el as HTMLElement, next, prev)
    return
  }

  if (name === 'dangerouslySetInnerHTML') {
    const nextHtml = next?.__html ?? ''
    const prevHtml = prev?.__html ?? ''
    if (nextHtml !== prevHtml) (el as HTMLElement).innerHTML = nextHtml
    return
  }

  if (name[0] === 'o' && name[1] === 'n') {
    setEventHandler(el, name, next, prev)
    return
  }

  if (name === 'htmlFor') {
    if (next == null) el.removeAttribute('for')
    else el.setAttribute('for', '' + next)
    return
  }

  if (!isSvg && IDL_ATTRS.has(name) && name in el) {
    try {
      ;(el as any)[name] = next == null ? '' : next
      return
    } catch {}
  }

  if (BOOLEAN_ATTRS.has(name.toLowerCase())) {
    if (next) el.setAttribute(name, '')
    else el.removeAttribute(name)
    return
  }

  // aria-* and data-* attributes stringify booleans to `"true"`/`"false"`
  // rather than using the HTML boolean-attribute presence/absence semantics.
  // This matches React and the ARIA spec (aria-hidden="false" is meaningful).
  if (name.length > 5 && (name.charCodeAt(0) === 97 /* a */ || name.charCodeAt(0) === 100 /* d */)) {
    if (name.startsWith('aria-') || name.startsWith('data-')) {
      if (next == null) {
        el.removeAttribute(name)
      } else {
        el.setAttribute(name, '' + next)
      }
      return
    }
  }

  if (next == null || next === false) {
    el.removeAttribute(name)
  } else if (next === true) {
    el.setAttribute(name, '')
  } else {
    el.setAttribute(name, '' + next)
  }
}

function setStyle(el: HTMLElement, next: any, prev: any): void {
  const style = el.style
  if (typeof next === 'string') {
    style.cssText = next
    return
  }
  if (typeof prev === 'string') style.cssText = ''
  if (prev && typeof prev === 'object') {
    for (const k in prev) {
      if (!next || !(k in next)) setStyleProperty(style, k, '')
    }
  }
  if (next && typeof next === 'object') {
    for (const k in next) {
      if (!prev || prev[k] !== next[k]) setStyleProperty(style, k, next[k])
    }
  }
}

function setStyleProperty(style: CSSStyleDeclaration, key: string, value: any): void {
  if (key[0] === '-') {
    style.setProperty(key, value == null ? '' : '' + value)
  } else if (value == null || value === '') {
    ;(style as any)[key] = ''
  } else if (typeof value === 'number' && !UNITLESS_STYLE.has(key)) {
    ;(style as any)[key] = value + 'px'
  } else {
    ;(style as any)[key] = '' + value
  }
}

const UNITLESS_STYLE = new Set([
  'animationIterationCount',
  'borderImageOutset',
  'borderImageSlice',
  'borderImageWidth',
  'boxFlex',
  'boxFlexGroup',
  'boxOrdinalGroup',
  'columnCount',
  'columns',
  'flex',
  'flexGrow',
  'flexPositive',
  'flexShrink',
  'flexNegative',
  'flexOrder',
  'gridArea',
  'gridRow',
  'gridRowEnd',
  'gridRowSpan',
  'gridRowStart',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnSpan',
  'gridColumnStart',
  'fontWeight',
  'lineClamp',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
  'fillOpacity',
  'floodOpacity',
  'stopOpacity',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeMiterlimit',
  'strokeOpacity',
  'strokeWidth',
])

export interface SyntheticEvent extends Event {
  nativeEvent: Event
  isDefaultPrevented(): boolean
  isPropagationStopped(): boolean
  persist(): void
  currentTarget: EventTarget & Element
}

function setEventHandler(el: Element, name: string, next: any, prev: any): void {
  // Only function handlers are accepted. Reject strings/objects/etc — the
  // legacy `onclick="..."` HTML attribute (string handler) is a known XSS
  // vector if a parent spreads untrusted props onto a host element. React
  // also ignores non-function handlers.
  if (next != null && typeof next !== 'function') next = null

  const capture = name.endsWith('Capture')
  const eventName = normalizeEventName(name.slice(2, capture ? -7 : undefined))

  const handlers = ((el as any).__handlers ||= Object.create(null))
  const key = eventName + (capture ? '_c' : '_b')

  if (handlers[key] && !next) {
    el.removeEventListener(eventName, handlers[key].listener, capture)
    handlers[key] = null
    return
  }

  if (!handlers[key] && next) {
    const entry = { current: next as Function, listener: null as any }
    entry.listener = (e: Event) => entry.current(e)
    handlers[key] = entry
    el.addEventListener(eventName, entry.listener, capture)
    return
  }

  if (handlers[key]) {
    handlers[key].current = next
  }
}

function normalizeEventName(name: string): string {
  const lower = name.toLowerCase()
  // React naming quirks → DOM
  if (lower === 'doubleclick') return 'dblclick'
  return lower
}

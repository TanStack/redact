import { attributeName } from '../core/attributes'

const ATTR_MAP: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
}
const TEXT_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
}

export function escapeAttr(value: string): string {
  return value.replace(/[&"<>]/g, (c) => ATTR_MAP[c]!)
}

export function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (c) => TEXT_MAP[c]!)
}

// Raw-text element body escaping: prevent any closing tag for the raw-text
// elements (<script>, <style>) from terminating the element early, plus
// `<!--` (which would start an HTML comment that survives even inside
// raw-text bodies and can be exploited to alter following script content).
// React's serializer follows the same approach.
export function escapeScript(value: string): string {
  return value
    .replace(/<\/(script|style)/gi, '<\\/$1')
    .replace(/<!--/g, '<\\!--')
}

export const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

export const RAW_TEXT_ELEMENTS = new Set(['script', 'style'])

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

export function attrToHtml(name: string, value: unknown, isSvg = false): string {
  if (
    name === 'children' ||
    name === 'key' ||
    name === 'ref' ||
    name === 'dangerouslySetInnerHTML' ||
    name === 'defaultValue' ||
    name === 'defaultChecked' ||
    name === 'suppressHydrationWarning' ||
    name === 'suppressContentEditableWarning'
  ) {
    return ''
  }
  if (name[0] === 'o' && name[1] === 'n' && typeof value === 'function') return ''
  if (value == null) return ''

  const htmlName = attributeName(name, isSvg)

  // aria-* and data-* stringify booleans to `"true"`/`"false"` rather than
  // using boolean-attribute presence semantics — matches React and the ARIA
  // spec. Must branch before the general `value === false` / BOOLEAN_ATTRS
  // path, which would drop them.
  if (name.startsWith('aria-') || name.startsWith('data-')) {
    return ` ${htmlName}="${escapeAttr(String(value))}"`
  }

  if (value === false) return ''

  if (value === true || BOOLEAN_ATTRS.has(htmlName)) {
    return value ? ` ${htmlName}=""` : ''
  }

  if (name === 'style' && typeof value === 'object' && value !== null) {
    return ` style="${escapeAttr(styleToString(value as Record<string, unknown>))}"`
  }

  return ` ${htmlName}="${escapeAttr(String(value))}"`
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

function styleToString(style: Record<string, unknown>): string {
  let out = ''
  for (const key in style) {
    const v = style[key]
    if (v == null || v === false) continue
    const kebab = key.startsWith('--')
      ? key
      : key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
    const value =
      typeof v === 'number' && !UNITLESS_STYLE.has(key) && v !== 0 ? v + 'px' : v
    out += `${kebab}:${value};`
  }
  return out
}

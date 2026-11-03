import { UNITLESS_STYLE } from '../core/unitless-style'
import { isFunction } from '../core/functions'
import { attributeName, STRING_BOOLEAN_ATTRS, BOOLEAN_ATTRS } from '../core/attributes'

function escape(value: string, pattern: RegExp): string {
  return value.replace(pattern, char => char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&quot;')
}

export function escapeAttr(value: string): string {
  return /[&"<>]/.test(value) ? escape(value, /[&"<>]/g) : value
}

export function escapeText(value: string): string {
  return /[&<>]/.test(value) ? escape(value, /[&<>]/g) : value
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
  if (name[0] === 'o' && name[1] === 'n' && isFunction(value)) return ''
  if (value == null) return ''

  const htmlName = attributeName(name, isSvg)

  // These attributes need explicit "false", not boolean-attribute absence.
  if (
    STRING_BOOLEAN_ATTRS.test(htmlName) ||
    name.startsWith('aria-') ||
    name.startsWith('data-')
  ) {
    return ` ${htmlName}="${escapeAttr(String(value))}"`
  }

  if (value === false) return ''

  if (value === true || BOOLEAN_ATTRS.test(htmlName)) {
    return value ? ` ${htmlName}=""` : ''
  }

  if (name === 'style' && typeof value === 'object' && value !== null) {
    return ` style="${escapeAttr(styleToString(value as Record<string, unknown>))}"`
  }

  return ` ${htmlName}="${escapeAttr(String(value))}"`
}



function styleToString(style: Record<string, unknown>): string {
  let out = ''
  for (const key in style) {
    const v = style[key]
    if (v == null || v === false) continue
    const kebab = key.startsWith('--')
      ? key
      : key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()).replace(/^ms-/, '-ms-')
    const value =
      typeof v === 'number' && !UNITLESS_STYLE.test(key) && v !== 0 ? v + 'px' : v
    out += `${kebab}:${value};`
  }
  return out
}

import { UNITLESS_STYLE } from '../core/unitless-style'
import { isFunction } from '../core/functions'
import { attributeName, STRING_BOOLEAN_ATTRS, BOOLEAN_ATTRS } from '../core/attributes'

function escapeCharacter(char: string): string {
  return char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&quot;'
}

export function escapeAttr(value: string): string {
  return /[&"<>]/.test(value) ? value.replace(/[&"<>]/g, escapeCharacter) : value
}

export function escapeText(value: string): string {
  return value.replace(/[&<>]/g, escapeCharacter)
}

// Raw-text element body escaping: prevent any closing tag for the raw-text
// elements (<script>, <style>) from terminating the element early, plus
// `<!--` (which would start an HTML comment that survives even inside
// raw-text bodies and can be exploited to alter following script content).
// React's serializer follows the same approach.
export function escapeScript(value: string): string {
  return value.replace(/<\/(?:script|style)|<!--/gi, match => '<\\' + match.slice(1))
}

// Exact tag names that the server writes without a closing tag.
export const VOID_ELEMENTS = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/

export function isInternalAttribute(name: string): boolean {
  return name === 'children' || name === 'dangerouslySetInnerHTML' ||
    name === 'suppressHydrationWarning' || name === 'suppressContentEditableWarning' ||
    name === 'ref' || name === 'key'
}

export function attrToHtml(name: string, value: unknown, isSvg = false): string {
  if (value == null || isInternalAttribute(name) || name === 'defaultValue' || name === 'defaultChecked' ||
      name[0] === 'o' && name[1] === 'n' && isFunction(value)) return ''

  const htmlName = attributeName(name, isSvg)

  // These attributes need explicit "false", not boolean-attribute absence.
  if (!STRING_BOOLEAN_ATTRS.test(htmlName) && !name.startsWith('aria-') && !name.startsWith('data-')) {
    if (value === false) return ''
    if (value === true || BOOLEAN_ATTRS.test(htmlName)) {
      return value ? ` ${htmlName}=""` : ''
    }
    if (name === 'style' && typeof value === 'object') {
      value = styleToString(value as Record<string, unknown>)
    }
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
      : key.replace(/^ms(?=[-A-Z])|[A-Z]/g, part => '-' + part.toLowerCase())
    const value =
      typeof v === 'number' && !UNITLESS_STYLE.test(key) && v !== 0 ? v + 'px' : v
    out += `${kebab}:${value};`
  }
  return out
}

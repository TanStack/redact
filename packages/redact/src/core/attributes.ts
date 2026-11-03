export const BOOLEAN_ATTRS = /^(allowfullscreen|async|autofocus|autoplay|checked|controls|credentialless|default|defer|disabled|formnovalidate|hidden|inert|ismap|itemscope|loop|multiple|muted|nomodule|novalidate|open|playsinline|readonly|required|reversed|selected)$/;
export const STRING_BOOLEAN_ATTRS = /^(contenteditable|draggable|spellcheck)$/

export function attributeName(name: string, isSvg?: boolean): string {
  if (name === 'className') return 'class'
  if (name === 'htmlFor') return 'for'
  if ((isSvg && /^(clip|fill|stroke)/.test(name)) || /^(httpEquiv|acceptCharset|maskType)$/.test(name)) {
    return name.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
  }
  if (name === 'tabIndex' || name === 'crossOrigin') return name.toLowerCase()
  return isSvg || /^(aria|data)-/.test(name) ? name : name.toLowerCase()
}

// Share property coercion with hydration without creating resource-bearing probes.
export function attributeValue(name: string, value: any, attr: string): string | null {
  if (/^on|^default(Value|Checked)$/.test(name)) return null
  if (name === 'className' || name === 'class' || name === 'htmlFor' || STRING_BOOLEAN_ATTRS.test(attr)) return value == null ? null : '' + value
  if (BOOLEAN_ATTRS.test(attr)) return value ? '' : null
  return value == null || value === false ? null : value === true ? '' : `${value}`
}

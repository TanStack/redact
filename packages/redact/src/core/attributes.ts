export const STRING_BOOLEAN_ATTRS = new Set([
  'contenteditable',
  'draggable',
  'spellcheck',
])

export function attributeName(name: string, isSvg = false): string {
  if (isSvg && name !== 'viewBox' && SVG_KEBAB_PREFIX.test(name)) {
    return name.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
  }
  if (name === 'className') return 'class'
  if (name === 'htmlFor') return 'for'
  if (name === 'httpEquiv') return 'http-equiv'
  if (name === 'acceptCharset') return 'accept-charset'
  if (name === 'crossOrigin') return 'crossorigin'
  if (name === 'noModule') return 'nomodule'
  if (name === 'viewBox') return 'viewBox'
  return name.startsWith('aria-') || name.startsWith('data-')
    ? name
    : name.toLowerCase()
}

const SVG_KEBAB_PREFIX = /^(?:clip|fill|stroke)/

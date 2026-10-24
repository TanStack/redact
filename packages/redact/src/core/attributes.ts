export const STRING_BOOLEAN_ATTRS = new Set([
  'contenteditable',
  'draggable',
  'spellcheck',
])

export function attributeName(name: string, isSvg = false): string {
  if (isSvg && SVG_CASE_SENSITIVE_ATTRS.has(name)) return name
  if (isSvg && name !== 'viewBox' && SVG_KEBAB_PREFIX.test(name)) {
    return name.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
  }
  if (name === 'className') return 'class'
  if (name === 'htmlFor') return 'for'
  if (name === 'httpEquiv') return 'http-equiv'
  if (name === 'acceptCharset') return 'accept-charset'
  if (name === 'crossOrigin') return 'crossorigin'
  if (name === 'noModule') return 'nomodule'
  if (name === 'maskType') return 'mask-type'
  if (name === 'viewBox') return 'viewBox'
  return name.startsWith('aria-') || name.startsWith('data-')
    ? name
    : name.toLowerCase()
}

const SVG_KEBAB_PREFIX = /^(?:clip|fill|stroke)/


// SVG attributes adjusted to mixed case by the HTML parser must retain that
// spelling during hydration and DOM updates. clipPathUnits is not clip-path-units.
const SVG_CASE_SENSITIVE_ATTRS = new Set([
  'attributeName',
  'attributeType',
  'baseFrequency',
  'baseProfile',
  'calcMode',
  'clipPathUnits',
  'diffuseConstant',
  'edgeMode',
  'filterUnits',
  'glyphRef',
  'gradientTransform',
  'gradientUnits',
  'kernelMatrix',
  'kernelUnitLength',
  'keyPoints',
  'keySplines',
  'keyTimes',
  'lengthAdjust',
  'limitingConeAngle',
  'markerHeight',
  'markerUnits',
  'markerWidth',
  'maskContentUnits',
  'maskUnits',
  'numOctaves',
  'pathLength',
  'patternContentUnits',
  'patternTransform',
  'patternUnits',
  'pointsAtX',
  'pointsAtY',
  'pointsAtZ',
  'preserveAlpha',
  'preserveAspectRatio',
  'primitiveUnits',
  'refX',
  'refY',
  'repeatCount',
  'repeatDur',
  'requiredExtensions',
  'requiredFeatures',
  'specularConstant',
  'specularExponent',
  'spreadMethod',
  'startOffset',
  'stdDeviation',
  'stitchTiles',
  'surfaceScale',
  'systemLanguage',
  'tableValues',
  'targetX',
  'targetY',
  'textLength',
  'viewBox',
  'viewTarget',
  'xChannelSelector',
  'yChannelSelector',
  'zoomAndPan',
]);

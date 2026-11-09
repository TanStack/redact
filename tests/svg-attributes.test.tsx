import { expect, it } from 'vitest'
import { createElement } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { attributeName } from '../packages/redact/src/core/attributes'

const aliases = {
  accentHeight: 'accent-height',
  alignmentBaseline: 'alignment-baseline',
  arabicForm: 'arabic-form',
  baselineShift: 'baseline-shift',
  capHeight: 'cap-height',
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  colorInterpolation: 'color-interpolation',
  colorInterpolationFilters: 'color-interpolation-filters',
  colorProfile: 'color-profile',
  colorRendering: 'color-rendering',
  dominantBaseline: 'dominant-baseline',
  enableBackground: 'enable-background',
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  floodColor: 'flood-color',
  floodOpacity: 'flood-opacity',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontSizeAdjust: 'font-size-adjust',
  fontStretch: 'font-stretch',
  fontStyle: 'font-style',
  fontVariant: 'font-variant',
  fontWeight: 'font-weight',
  glyphName: 'glyph-name',
  glyphOrientationHorizontal: 'glyph-orientation-horizontal',
  glyphOrientationVertical: 'glyph-orientation-vertical',
  horizAdvX: 'horiz-adv-x',
  horizOriginX: 'horiz-origin-x',
  imageRendering: 'image-rendering',
  letterSpacing: 'letter-spacing',
  lightingColor: 'lighting-color',
  markerEnd: 'marker-end',
  markerMid: 'marker-mid',
  markerStart: 'marker-start',
  overlinePosition: 'overline-position',
  overlineThickness: 'overline-thickness',
  paintOrder: 'paint-order',
  pointerEvents: 'pointer-events',
  renderingIntent: 'rendering-intent',
  shapeRendering: 'shape-rendering',
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  strikethroughPosition: 'strikethrough-position',
  strikethroughThickness: 'strikethrough-thickness',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeMiterlimit: 'stroke-miterlimit',
  strokeOpacity: 'stroke-opacity',
  strokeWidth: 'stroke-width',
  textAnchor: 'text-anchor',
  textDecoration: 'text-decoration',
  textRendering: 'text-rendering',
  transformOrigin: 'transform-origin',
  underlinePosition: 'underline-position',
  underlineThickness: 'underline-thickness',
  unicodeBidi: 'unicode-bidi',
  unicodeRange: 'unicode-range',
  unitsPerEm: 'units-per-em',
  vAlphabetic: 'v-alphabetic',
  vHanging: 'v-hanging',
  vIdeographic: 'v-ideographic',
  vMathematical: 'v-mathematical',
  vectorEffect: 'vector-effect',
  vertAdvY: 'vert-adv-y',
  vertOriginX: 'vert-origin-x',
  vertOriginY: 'vert-origin-y',
  wordSpacing: 'word-spacing',
  writingMode: 'writing-mode',
  xHeight: 'x-height',
}

const preserved = ['viewBox', 'gradientUnits', 'gradientTransform', 'preserveAspectRatio',
  'patternUnits', 'markerWidth', 'refX', 'attributeName', 'keyTimes', 'stdDeviation',
  'textLength', 'glyphRef', 'markerHeight', 'markerUnits']

it('maps SVG aliases and preserves case-sensitive SVG names', () => {
  for (const [prop, attr] of Object.entries(aliases)) expect(attributeName(prop, true)).toBe(attr)
  for (const prop of preserved) expect(attributeName(prop, true)).toBe(prop)
  for (const prop of ['customCamelCase', 'fontSizeCustom', 'strokeWidthCustom', 'textAnchorCustom']) {
    expect(attributeName(prop, true)).toBe(prop)
  }
  for (const suffix of ['\n', '\r', '\u2028', '\u2029']) {
    expect(attributeName('fontSize' + suffix, true)).toBe('fontSize' + suffix)
  }
  expect(attributeName('fontSize', false)).toBe('fontsize')
  expect(attributeName('className', true)).toBe('class')
  expect(attributeName('htmlFor', true)).toBe('for')
})

const props = Object.fromEntries([...Object.keys(aliases), ...preserved].map(name => [name, 'first']))
const tree = (value: string) => createElement('svg', null,
  createElement('text', Object.fromEntries(Object.keys(props).map(name => [name, value])), 'Hello'))

function check(container: Element, value: string | null) {
  const text = container.querySelector('text')!
  for (const [prop, attr] of Object.entries(aliases)) {
    expect(text.getAttribute(attr)).toBe(value)
    expect(text.hasAttribute(prop)).toBe(false)
  }
  for (const prop of preserved) expect(text.getAttribute(prop)).toBe(value)
}

it('sets, updates and removes SVG attributes in the browser', () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    root.render(tree('first'))
    check(container, 'first')
    root.render(tree('second'))
    check(container, 'second')
    root.render(createElement('svg', null, createElement('text', null, 'Hello')))
    check(container, null)
  } finally { root.unmount() }
})

it('serializes SVG attributes and hydrates existing correctly named attributes', () => {
  const container = document.createElement('div')
  const html = renderToString(tree('first'))
  for (const attr of [...Object.values(aliases), ...preserved]) expect(html).toContain(`${attr}="first"`)
  container.innerHTML = html
  check(container, 'first')
  const original = container.querySelector('text')
  const errors: unknown[] = []
  const root = hydrateRoot(container, tree('first'), { onRecoverableError: error => errors.push(error) })
  try {
    expect(errors).toEqual([])
    expect(container.querySelector('text')).toBe(original)
    root.render(tree('second'))
    check(container, 'second')
  } finally { root.unmount() }
})

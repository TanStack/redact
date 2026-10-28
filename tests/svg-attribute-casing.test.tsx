import { expect, it } from 'vitest'
import { createElement as h, Suspense } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'
it.each([
 ['pattern', 'patternUnits', 'userSpaceOnUse'],
 ['pattern', 'patternContentUnits', 'objectBoundingBox'],
 ['linearGradient', 'gradientUnits', 'userSpaceOnUse'],
 ['linearGradient', 'gradientTransform', 'translate(1,2)'],
 ['svg', 'preserveAspectRatio', 'none'],
 ['marker', 'markerUnits', 'userSpaceOnUse'],
 ['marker', 'refX', '10'],
 ['text', 'textLength', '10'],
])('preserves %s %s through SSR and hydration', (tag, name, value) => {
 const tree = h(Suspense, { fallback: null }, h('main', null, h('svg', { viewBox: '0 0 20 20' }, h(tag, { [name]: value }))))
 const html = renderToString(tree); expect(html).toContain(name + '="' + value + '"')
 const container = document.createElement('div'); container.innerHTML = html; document.body.append(container)
 const main = container.querySelector('main'), errors: unknown[] = []
 const root = hydrateRoot(container, tree, { onRecoverableError: error => errors.push(error) })
 try { expect(container.querySelector('main')).toBe(main); expect(errors).toEqual([]); expect(container.querySelector('main > svg > ' + tag)!.getAttribute(name)).toBe(value) }
 finally { flushSync(() => root.unmount()); container.remove() }
})

// React maps these camelCase props to hyphenated SVG attributes (getAttributeAlias); the browser ignores the camelCase spelling.
it.each([
 ['svg', 'shapeRendering', 'shape-rendering', 'crispEdges'],
 ['text', 'fontSize', 'font-size', '58'],
 ['text', 'textAnchor', 'text-anchor', 'middle'],
 ['stop', 'stopColor', 'stop-color', 'red'],
 ['path', 'markerEnd', 'marker-end', 'url(#m)'],
 ['path', 'vectorEffect', 'vector-effect', 'non-scaling-stroke'],
 ['g', 'transformOrigin', 'transform-origin', 'center'],
 ['svg', 'colorInterpolationFilters', 'color-interpolation-filters', 'sRGB'],
 ['clipPath', 'clipPathUnits', 'clipPathUnits', 'objectBoundingBox'],
])('maps %s %s to %s through SSR, hydration and client render', (tag, name, attr, value) => {
 const tree = h(Suspense, { fallback: null }, h('main', null, h('svg', { viewBox: '0 0 20 20' }, h(tag, { [name]: value }))))
 const html = renderToString(tree); expect(html).toContain(' ' + attr + '="' + value + '"')
 const container = document.createElement('div'); container.innerHTML = html; document.body.append(container)
 const main = container.querySelector('main'), errors: unknown[] = []
 const root = hydrateRoot(container, tree, { onRecoverableError: error => errors.push(error) })
 try { expect(container.querySelector('main')).toBe(main); expect(errors).toEqual([]); expect(container.querySelector('main > svg > ' + tag)!.getAttribute(attr)).toBe(value) }
 finally { flushSync(() => root.unmount()); container.remove() }
 const fresh = document.createElement('div'); document.body.append(fresh)
 const clean = createRoot(fresh)
 try { flushSync(() => clean.render(tree)); expect(fresh.querySelector('main > svg > ' + tag)!.getAttribute(attr)).toBe(value) }
 finally { flushSync(() => clean.unmount()); fresh.remove() }
})

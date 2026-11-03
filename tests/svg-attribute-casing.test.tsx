import { expect, it } from 'vitest'
import { createElement as h, Suspense } from 'react'
import { hydrateRoot } from 'react-dom/client'
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

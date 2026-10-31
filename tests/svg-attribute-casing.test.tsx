import { expect, it } from 'vitest'
import { createElement as h, Suspense, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToReadableStream, renderToString } from 'react-dom/server'
import { BOUNDARY_REVEAL_RUNTIME } from '../packages/redact/src/server/bootstrap-script'

const SVG_NS = 'http://www.w3.org/2000/svg'
const HTML_NS = 'http://www.w3.org/1999/xhtml'

// Releases the suspended child only after the shell has flushed, so the boundary is really outlined.
async function streamAfterShell(make: (Late: (props: { children: ReactNode }) => ReactNode) => ReactNode) {
 let ready = false, release!: () => void
 const gate = new Promise<void>(resolve => { release = () => { ready = true; resolve() } })
 const Late = ({ children }: { children: ReactNode }) => { if (!ready) throw gate; return children }
 const tree = make(Late)
 const reader = (await renderToReadableStream(tree)).getReader(), decoder = new TextDecoder()
 let html = ''
 for (let first = true; ; first = false) {
  const { done, value } = await reader.read()
  if (done) break
  html += decoder.decode(value, { stream: true })
  if (first) release()
 }
 return { tree, html }
}

// Loads the markup without its scripts, so the test controls when the boundary reveals.
function loadStreamed(html: string) {
 const container = document.createElement('div')
 container.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, '')
 document.body.append(container)
 new Function(BOUNDARY_REVEAL_RUNTIME)()
 const id = +/id="S:(\d+)"/.exec(html)![1]!
 return { container, reveal: () => (window as any).$RC(id) }
}

it('hyphenates vectorEffect through SSR, hydration and client render', () => {
 const tree = h(Suspense, { fallback: null }, h('main', null, h('svg', null, h('path', { d: 'M0 0L9 9', vectorEffect: 'non-scaling-stroke' }))))
 const html = renderToString(tree); expect(html).toContain('vector-effect="non-scaling-stroke"')
 const container = document.createElement('div'); container.innerHTML = html; document.body.append(container)
 const main = container.querySelector('main'), errors: unknown[] = []
 const root = hydrateRoot(container, tree, { onRecoverableError: error => errors.push(error) })
 try { expect(container.querySelector('main')).toBe(main); expect(errors).toEqual([]); expect(container.querySelector('path')!.getAttribute('vector-effect')).toBe('non-scaling-stroke') }
 finally { flushSync(() => root.unmount()); container.remove() }
 const client = document.createElement('div'), clientRoot = createRoot(client)
 flushSync(() => clientRoot.render(tree))
 expect(client.querySelector('path')!.getAttributeNames()).toContain('vector-effect')
 flushSync(() => clientRoot.unmount())
})

it('keeps SVG context for a boundary streamed inside <svg>', async () => {
 const { tree, html } = await streamAfterShell(Late => h('main', null, h('svg', { viewBox: '0 0 9 9' }, h(Suspense, { fallback: h('rect', { id: 'f' }) }, h(Late, null, h('symbol', { id: 't', preserveAspectRatio: 'none' }), h('path', { id: 'p', vectorEffect: 'non-scaling-stroke' }))))))
 expect(html).toContain('preserveAspectRatio="none"'); expect(html).toContain('vector-effect="non-scaling-stroke"'); expect(html).not.toContain('preserveaspectratio')
 const { container, reveal } = loadStreamed(html)
 const svg = container.querySelector('main > svg')!
 try {
  expect(container.querySelector('#f')!.namespaceURI).toBe(SVG_NS); expect(svg.contains(container.querySelector('#f'))).toBe(true)
  reveal()
  const symbol = container.querySelector('#t')!
  expect(symbol.parentElement).toBe(svg); expect(symbol.namespaceURI).toBe(SVG_NS); expect(symbol.getAttribute('preserveAspectRatio')).toBe('none')
  expect(container.querySelector('#p')!.namespaceURI).toBe(SVG_NS); expect(container.querySelector('#f')).toBeNull(); expect(container.querySelector('[id^="S:"]')).toBeNull()
  const errors: unknown[] = [], root = hydrateRoot(container, tree, { onRecoverableError: error => errors.push(error) })
  try { await new Promise(resolve => setTimeout(resolve)); expect(errors).toEqual([]); expect(container.querySelector('#t')).toBe(symbol) }
  finally { flushSync(() => root.unmount()) }
 } finally { (window as any).$RE_stop?.(); container.remove() }
})

it('hydrates an SVG boundary whose reveal arrives after hydration starts', async () => {
 const { tree, html } = await streamAfterShell(Late => h('main', null, h('svg', null, h(Suspense, { fallback: h('rect', { id: 'f' }) }, h(Late, null, h('symbol', { id: 't', preserveAspectRatio: 'none' }))))))
 const { container, reveal } = loadStreamed(html)
 const svg = container.querySelector('main > svg')!, fallback = container.querySelector('#f')
 const errors: unknown[] = [], root = hydrateRoot(container, tree, { onRecoverableError: error => errors.push(error) })
 try {
  await new Promise(resolve => setTimeout(resolve))
  expect(container.querySelector('main > svg')).toBe(svg); expect(container.querySelector('#f')).toBe(fallback)
  reveal()
  await new Promise(resolve => setTimeout(resolve, 20))
  const symbol = container.querySelector('#t')!
  expect(errors).toEqual([]); expect(container.querySelector('main > svg')).toBe(svg); expect(container.querySelector('#f')).toBeNull()
  expect(symbol.parentElement).toBe(svg); expect(symbol.namespaceURI).toBe(SVG_NS); expect(symbol.getAttribute('preserveAspectRatio')).toBe('none')
 } finally { flushSync(() => root.unmount()); (window as any).$RE_stop?.(); container.remove() }
})

it('keeps HTML context for a boundary streamed inside <foreignObject>', async () => {
 const { html } = await streamAfterShell(Late => h('main', null, h('svg', null, h('foreignObject', null, h(Suspense, { fallback: h('p', { id: 'f' }) }, h(Late, null, h('p', { id: 't', tabIndex: 0 })))))))
 expect(html).toContain('tabindex="0"')
 const { container, reveal } = loadStreamed(html)
 try {
  expect(container.querySelector('#f')!.namespaceURI).toBe(HTML_NS)
  reveal()
  expect(container.querySelector('#t')!.namespaceURI).toBe(HTML_NS); expect(container.querySelector('foreignObject')!.contains(container.querySelector('#t'))).toBe(true)
 } finally { (window as any).$RE_stop?.(); container.remove() }
})

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

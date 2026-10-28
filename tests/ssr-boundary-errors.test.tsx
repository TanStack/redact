import { expect, it } from 'vitest'
import { createElement as h, Suspense, lazy } from 'react'
import { renderToReadableStream, renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
const failure = new Error('server-only boundary failure')
function Thrower(): never { throw failure }
it('streams a synchronous boundary error as client fallback and reports it once', async () => {
 const errors: unknown[] = []
 const stream = await renderToReadableStream(h('main', null, h(Suspense, { fallback: h('p', null, 'loading') }, h(Thrower)), h('span', null, 'sibling')), { onError: error => { errors.push(error) } })
 const html = await new Response(stream).text()
 expect(html).toContain('loading'); expect(html).toContain('sibling'); expect(html).toContain('<!--$E0-->'); expect(errors).toEqual([failure])
 await stream.allReady
})
it('keeps root errors fatal and reports them once', async () => {
 const errors: unknown[] = []
 await expect(renderToReadableStream(h(Thrower), { onError: error => { errors.push(error) } })).rejects.toBe(failure)
 expect(errors).toEqual([failure])
})
it('lets the nearest parent boundary handle errors thrown by a fallback', async () => {
 const errors: unknown[] = [], fallbackFailure = new Error('fallback failure')
 function Fallback(): never { throw fallbackFailure }
 const stream = await renderToReadableStream(h(Suspense, { fallback: h('p', null, 'outer') }, h(Suspense, { fallback: h(Fallback) }, h(Thrower))), { onError: error => { errors.push(error) } })
 const html = await new Response(stream).text()
 expect(html).toContain('outer'); expect(errors).toEqual([failure, fallbackFailure])
})
it('keeps rejected lazy components on the existing streaming failure path', async () => {
 const errors: unknown[] = [], Lazy = lazy(() => Promise.reject(failure))
 const stream = await renderToReadableStream(h(Suspense, { fallback: h('p', null, 'loading') }, h(Lazy)), { onError: error => { errors.push(error) } })
 const html = await new Response(stream).text()
 expect(html).toContain('loading'); expect(errors).toEqual([failure]); expect(html).toContain('$RB("B:0",1)')
})
it('recovers the failed boundary on the client without replacing a sibling', async () => {
 let server = true
 function Child() { if (server) throw failure; return h('button', null, 'client ready') }
 const tree = h('main', null, h(Suspense, { fallback: h('p', null, 'loading') }, h(Child)), h('span', { id: 'sibling' }, 'sibling'))
 const html = await new Response(await renderToReadableStream(tree, { onError() {} })).text()
 const container = document.createElement('div'); container.innerHTML = html; document.body.append(container)
 const sibling = container.querySelector('#sibling'); const errors: unknown[] = []; server = false
 const root = hydrateRoot(container, tree, { onRecoverableError: error => errors.push(error) })
 try { expect(container.querySelector('button')?.textContent).toBe('client ready'); expect(container.querySelector('#sibling')).toBe(sibling); expect(errors).toHaveLength(1) }
 finally { flushSync(() => root.unmount()); container.remove() }
})
it('renders synchronous string fallbacks without losing following siblings', () => {
 const html = renderToString(h('main', null, h(Suspense, { fallback: h('p', null, 'loading') }, h(Thrower)), h('span', null, 'sibling')))
 expect(html).toContain('loading'); expect(html).toContain('sibling')
})

import { afterEach, expect, it, vi } from 'vitest'
import { Fragment, Suspense, createElement as h, useId } from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToReadableStream, renderToString } from 'react-dom/server'

const roots: Array<{ unmount(): void }> = []
afterEach(() => { for (const root of roots.splice(0)) root.unmount(); document.body.innerHTML = '' })

function install(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  for (const script of container.querySelectorAll('script')) new Function(script.textContent!)()
  return container
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(r => { resolve = r })
  let ready = false
  return { promise, resolve() { ready = true; resolve() }, read() { if (!ready) throw promise } }
}
function Field({ name = 'field' }: { name?: string }) {
  const id = useId(), description = useId()
  return <label htmlFor={id}>{name}<input id={id} aria-describedby={description} /><span id={description}>help</span></label>
}

it.each([undefined, 'modern-js-'])('hydrates tree-position IDs after boundaries resolve out of order (prefix %s)', async prefix => {
  const a = deferred(), b = deferred()
  function AsyncField({ gate }: { gate: ReturnType<typeof deferred> }) { gate.read(); return <Field /> }
  function Parent() { const id = useId(); return <section id={id}><Field /></section> }
  const tree = <main><Suspense fallback={null}><AsyncField gate={a} /></Suspense><Parent /><Suspense fallback={null}><AsyncField gate={b} /></Suspense>{null}{[<Field key="last" />]}</main>
  const options = prefix === undefined ? {} : { identifierPrefix: prefix }
  const stream = await renderToReadableStream(tree, options)
  b.resolve()
  await Promise.resolve()
  a.resolve()
  const container = install(await new Response(stream).text())
  const main = container.firstElementChild
  const nodes = [...container.querySelectorAll('input, label, span, section')]
  const error = vi.fn()
  roots.push(hydrateRoot(container, tree, { ...options, onRecoverableError: error }))
  expect(error).not.toHaveBeenCalled()
  expect(container.firstElementChild).toBe(main)
  const hydratedNodes = [...container.querySelectorAll('input, label, span, section')]
  expect(hydratedNodes).toHaveLength(nodes.length)
  hydratedNodes.forEach((node, index) => expect(node).toBe(nodes[index]))
  const ids = [...container.querySelectorAll('[id]')].map(node => node.id)
  expect(new Set(ids).size).toBe(ids.length)
})

it('separates explicit-prefix hydrated IDs from new client IDs and other roots', () => {
  const prefix = 'modern-js-'
  const tree = (extra = false) => <main><Field key="a" />{extra && <Field key="b" />}</main>
  const container = install(renderToString(tree(), { identifierPrefix: prefix }))
  const input = container.querySelector('input')!
  const error = vi.fn()
  const root = hydrateRoot(container, tree(), { identifierPrefix: prefix, onRecoverableError: error })
  roots.push(root)
  flushSync(() => root.render(tree(true)))
  const other = document.createElement('div')
  document.body.appendChild(other)
  const client = createRoot(other, { identifierPrefix: prefix })
  roots.push(client)
  flushSync(() => client.render(<Field />))
  expect(error).not.toHaveBeenCalled()
  expect(container.querySelector('input')).toBe(input)
  const ids = [...document.querySelectorAll('[id]')].map(node => node.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(input.id).toMatch(/^_modern-js-R_/)
  expect(other.querySelector('input')!.id).toMatch(/^_modern-js-r_/)
})

it('matches nested arrays, empty slots, iterables and useId parents with deep descendants', () => {
  function Parent() { return <div id={useId()}>{[null, [<Field key="a" />, false], new Set([<Field key="b" />])]}</div> }
  let tree = h(Parent)
  for (let i = 0; i < 40; i++) tree = h(Fragment, null, null, tree)
  const container = install(renderToString(tree))
  const div = container.firstElementChild
  const error = vi.fn()
  roots.push(hydrateRoot(container, tree, { onRecoverableError: error }))
  expect(error).not.toHaveBeenCalled()
  expect(container.firstElementChild).toBe(div)
  const ids = [...container.querySelectorAll('[id]')].map(node => node.id)
  expect(new Set(ids).size).toBe(ids.length)
})

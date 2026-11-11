import { afterEach, expect, it, vi } from 'vitest'
import { Suspense, lazy, useEffect, useLayoutEffect } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

const cleanup: Array<() => void> = []
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose() })

it.each(['resolve', 'replace'])('releases head claims from abandoned root hydration before %s', async action => {
  const doc = new DOMParser().parseFromString('<html><head><title>Page</title><meta name="description" content="Page"></head><body><main><button>ready</button></main></body></html>', 'text/html')
  const container = doc.querySelector('main')!, title = doc.querySelector('title')!, meta = doc.querySelector('meta')!
  let resolve!: (value: { default: typeof Child }) => void
  const mounted = vi.fn(), errors = vi.fn()
  function Child() { useEffect(mounted, []); return <button>ready</button> }
  const Lazy = lazy(() => new Promise<{ default: typeof Child }>(yes => { resolve = yes }))
  const tree = <><title>Page</title><meta name="description" content="Page" /><Lazy /></>
  const root = hydrateRoot(container, tree, { onRecoverableError: errors })
  cleanup.push(() => root.unmount())
  expect(mounted).not.toHaveBeenCalled()
  if (action === 'resolve') resolve({ default: Child })
  else flushSync(() => root.render(<><title>Page</title><meta name="description" content="Page" /><Child /></>))
  await vi.waitFor(() => expect(mounted).toHaveBeenCalledTimes(1))
  expect(doc.querySelectorAll('title')).toHaveLength(1)
  expect(doc.querySelectorAll('meta')).toHaveLength(1)
  expect(doc.querySelector('title')).toBe(title)
  expect(doc.querySelector('meta')).toBe(meta)
  flushSync(() => root.render(<><title>Updated</title><meta name="description" content="Updated" /><Child /></>))
  expect(doc.title).toBe('Updated')
  expect(title.textContent).toBe('Updated')
  expect(meta.getAttribute('content')).toBe('Updated')
  expect(errors).not.toHaveBeenCalled()
  if (action === 'replace') { resolve({ default: Child }); await Promise.resolve(); expect(doc.title).toBe('Updated') }
})

it('keeps inline metadata adoption inside the active Suspense cursor', async () => {
  function First() { return <><title>first</title><meta name="description" content="first" /><button>first</button></> }
  function Second() { return <><title>second</title><meta name="description" content="second" /><button>second</button></> }
  const tree = <main><Suspense fallback={null}><First /></Suspense><Suspense fallback={null}><Second /></Suspense></main>
  const doc = new DOMParser().parseFromString('<html><head></head><body><div></div></body></html>', 'text/html')
  const container = doc.querySelector('div')!
  container.innerHTML = renderToString(tree)
  const titles = Array.from(container.querySelectorAll('title')), metas = Array.from(container.querySelectorAll('meta')), buttons = Array.from(container.querySelectorAll('button'))
  let resolve!: (value: { default: typeof First }) => void
  const Lazy = lazy(() => new Promise<{ default: typeof First }>(yes => { resolve = yes }))
  const errors = vi.fn(), mounted = vi.fn()
  function ReadySecond() { useLayoutEffect(mounted, []); return <Second /> }
  const root = hydrateRoot(container, <main><Suspense fallback={null}><Lazy /></Suspense><Suspense fallback={null}><ReadySecond /></Suspense></main>, { onRecoverableError: errors })
  cleanup.push(() => root.unmount())
  expect(mounted).toHaveBeenCalledTimes(1)
  expect(doc.head.querySelector('title')).toBe(titles[1])
  expect(container.querySelector('title')).toBe(titles[0])
  expect(doc.head.querySelector('meta')).toBe(metas[1])
  expect(errors).not.toHaveBeenCalled()
  resolve({ default: First })
  await vi.waitFor(() => expect(doc.head.querySelectorAll('title')).toHaveLength(2))
  for (const title of titles) expect(title.parentNode).toBe(doc.head)
  for (const meta of metas) expect(meta.parentNode).toBe(doc.head)
  Array.from(container.querySelectorAll('button')).forEach((button, index) => expect(button).toBe(buttons[index]))
  expect(errors).not.toHaveBeenCalled()
})

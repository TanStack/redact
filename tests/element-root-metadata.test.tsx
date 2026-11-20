import { afterEach, expect, it, vi } from 'vitest'
import { Suspense, lazy, useEffect, useState } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

it.each([false, true])('adopts hoisted metadata with an Element root and lazy=%s', async pending => {
  const doc = new DOMParser().parseFromString('<!doctype html><html><head><title>Page</title><meta name="description" content="Page"></head><body><main><!--$--><section><h1>Page</h1><!--$--><aside><button>0</button></aside><!--/$--></section><!--/$--></main></body></html>', 'text/html')
  const container = doc.querySelector('main')!
  const section = doc.querySelector('section'), aside = doc.querySelector('aside')
  const title = doc.querySelector('title'), meta = doc.querySelector('meta')
  const error = vi.fn(), mounted = vi.fn()
  function Counter() {
    useEffect(mounted, [])
    const [count, setCount] = useState(0)
    return <aside><button onClick={() => setCount(value => value + 1)}>{count}</button></aside>
  }
  let resolve!: (value: { default: typeof Counter }) => void
  const load = vi.fn(() => new Promise<{ default: typeof Counter }>(yes => { resolve = yes }))
  const Lazy = lazy(load)
  function Page({ updated = false }: { updated?: boolean }) {
    return <Suspense fallback={null}><section><title>{updated ? 'Updated' : 'Page'}</title><meta name="description" content={updated ? 'Updated' : 'Page'} /><h1>Page</h1><Suspense fallback={<i>Loading</i>}>{pending ? <Lazy /> : <Counter />}</Suspense></section></Suspense>
  }
  const root = hydrateRoot(container, <Page />, { onRecoverableError: error, onUncaughtError: error })
  cleanups.push(() => root.unmount())
  expect(doc.querySelector('section')).toBe(section)
  expect(doc.querySelector('aside')).toBe(aside)
  expect(doc.querySelector('title')).toBe(title)
  expect(doc.querySelector('meta')).toBe(meta)
  expect(container.querySelector('title,meta')).toBeNull()
  expect(error).not.toHaveBeenCalled()
  if (pending) {
    expect(load).toHaveBeenCalledTimes(1)
    resolve({ default: Counter })
    await vi.waitFor(() => expect(mounted).toHaveBeenCalledTimes(1))
  }
  flushSync(() => doc.querySelector('button')!.click())
  expect(doc.querySelector('button')?.textContent).toBe('1')
  expect(doc.querySelector('aside')).toBe(aside)
  flushSync(() => root.render(<Page updated />))
  expect(doc.querySelector('title')).toBe(title)
  expect(doc.querySelector('meta')).toBe(meta)
  expect(title?.textContent).toBe('Updated')
  expect(meta?.getAttribute('content')).toBe('Updated')
  expect(error).not.toHaveBeenCalled()
})

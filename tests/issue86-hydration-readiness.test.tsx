import { expect, it, vi } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

it('uses a component-owned readiness signal without relying on React private node properties', async () => {
  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = '<button>0</button>'
  const original = container.firstElementChild
  function Button() {
    const ref = React.useRef<HTMLButtonElement>(null)
    const [count, setCount] = React.useState(0)
    React.useEffect(() => {
      const node = ref.current!
      node.dataset.appReady = 'true'
      return () => { delete node.dataset.appReady }
    }, [])
    return <button ref={ref} onClick={() => setCount(n => n + 1)}>{count}</button>
  }
  const root = hydrateRoot(container, <Button />)
  try {
    await vi.waitFor(() => expect(container.querySelector('[data-app-ready="true"]')).toBe(original))
    flushSync(() => (original as HTMLButtonElement).click())
    expect(original!.textContent).toBe('1')
    expect((original as HTMLElement).dataset.appReady).toBe('true')
  } finally { flushSync(() => root.unmount()); container.remove() }
})

it('does not treat an outer readiness signal as hydration of a suspended child', async () => {
  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = '<main><button>Outer</button><!--$--><button>Inner</button><!--/$--></main>'
  const inner = container.querySelectorAll('button')[1]
  let ready = false, release!: () => void
  const waiting = new Promise<void>(r => { release = () => { ready = true; r() } })
  function Inner() {
    if (!ready) throw waiting
    const ref = React.useRef<HTMLButtonElement>(null)
    React.useEffect(() => {
      const node = ref.current!
      node.dataset.appReady = 'true'
      return () => { delete node.dataset.appReady }
    }, [])
    return <button ref={ref}>Inner</button>
  }
  function App() {
    const ref = React.useRef<HTMLElement>(null)
    React.useEffect(() => {
      const node = ref.current!
      node.dataset.appReady = 'true'
      return () => { delete node.dataset.appReady }
    }, [])
    return <main ref={ref}><button>Outer</button><React.Suspense fallback={<i>Waiting</i>}><Inner /></React.Suspense></main>
  }
  const root = hydrateRoot(container, <App />)
  try {
    await vi.waitFor(() => expect(container.querySelector('main')!.dataset.appReady).toBe('true'))
    expect((inner as HTMLElement).dataset.appReady).toBeUndefined()
    release()
    await vi.waitFor(() => expect((inner as HTMLElement).dataset.appReady).toBe('true'))
    expect(container.querySelectorAll('button')[1]).toBe(inner)
  } finally { release(); flushSync(() => root.unmount()); container.remove() }
})

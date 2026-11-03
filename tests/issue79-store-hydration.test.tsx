import { afterEach, expect, it } from 'vitest'
import { act, createElement as h, lazy, Suspense, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

const roots: ReturnType<typeof hydrateRoot>[] = []
afterEach(() => {
  for (const root of roots.splice(0)) flushSync(() => root.unmount())
  document.body.innerHTML = ''
})
const createContainer = () => document.body.appendChild(document.createElement('main'))

for (const stable of [false, true]) {
  it(`switches to the client snapshot after hydration, stable subscribe=${stable}`, async () => {
    const container = createContainer(), values: boolean[] = [], errors: unknown[] = []
    const listeners = new Set<() => void>()
    let value = false
    const subscribe = (callback: () => void) => {
      listeners.add(callback)
      return () => { listeners.delete(callback) }
    }
    function App() {
      const server = useSyncExternalStore(stable ? subscribe : callback => subscribe(callback), () => value, () => true)
      values.push(server)
      return h('p', null, server ? 'server' : 'client')
    }
    container.innerHTML = renderToString(h(App))
    const original = container.firstChild
    values.length = 0
    await act(async () => {
      roots.push(hydrateRoot(container, h(App), { onRecoverableError: error => errors.push(error) }))
    })
    expect(values).toEqual([true, false])
    expect(container.firstChild).toBe(original)
    expect(container.textContent).toBe('client')
    expect(errors).toEqual([])
    await act(async () => {
      value = true
      for (const notify of listeners) notify()
    })
    expect(container.textContent).toBe('server')
    expect(values.at(-1)).toBe(true)
    expect(listeners.size).toBe(1)
  })
}

it('reads client snapshots on an update from the hydration layout effect', async () => {
  const container = createContainer(), values: boolean[] = [], layout: string[] = []
  const subscribe = () => () => {}
  function App() {
    const [step, setStep] = useState(0)
    const server = useSyncExternalStore(subscribe, () => false, () => true)
    values.push(server)
    useLayoutEffect(() => {
      layout.push(container.textContent!)
      if (!step) setStep(1)
    }, [step])
    return h('p', null, (server ? 'server' : 'client') + step)
  }
  container.innerHTML = renderToString(h(App))
  values.length = 0
  await act(async () => { roots.push(hydrateRoot(container, h(App))) })
  expect(values).toEqual([true, false])
  expect(layout).toEqual(['server0', 'client1'])
  expect(container.textContent).toBe('client1')
})

it('observes a store update fired while the hydration subscription is installed', async () => {
  const container = createContainer(), values: number[] = []
  let value = 1, active = 0
  const subscribe = (notify: () => void) => {
    active++
    value = 2
    notify()
    return () => { active-- }
  }
  function App() {
    const next = useSyncExternalStore(subscribe, () => value, () => 0)
    values.push(next)
    return h('p', null, next)
  }
  container.innerHTML = renderToString(h(App))
  const original = container.firstChild
  values.length = 0
  await act(async () => { roots.push(hydrateRoot(container, h(App))) })
  expect(values).toEqual([0, 2])
  expect(container.textContent).toBe('2')
  expect(container.firstChild).toBe(original)
  expect(active).toBe(1)
})

it('finishes a deferred boundary hydration before checking its client snapshot', async () => {
  const container = createContainer(), values: boolean[] = [], errors: unknown[] = []
  let resolve!: (value: { default: typeof Store }) => void
  const ready = new Promise<{ default: typeof Store }>(done => { resolve = done })
  const subscribe = () => () => {}
  function Store() {
    const server = useSyncExternalStore(subscribe, () => false, () => true)
    values.push(server)
    return h('p', null, server ? 'server' : 'client')
  }
  const Lazy = lazy(() => ready)
  const tree = (child: ReturnType<typeof h>) => [
    h(Suspense, { key: 'boundary', fallback: h('i', null, 'waiting') }, child),
    h('button', { key: 'neighbor' }, 'neighbor'),
  ]
  container.innerHTML = renderToString(tree(h(Store)))
  const original = container.querySelector('p'), neighbor = container.querySelector('button')
  values.length = 0
  await act(async () => {
    roots.push(hydrateRoot(container, tree(h(Lazy)), { onRecoverableError: error => errors.push(error) }))
  })
  expect(values).toEqual([])
  expect(container.querySelector('p')).toBe(original)
  await act(async () => { resolve({ default: Store }) })
  expect(values).toEqual([true, false])
  expect(container.textContent).toBe('clientneighbor')
  expect(container.querySelector('p')).toBe(original)
  expect(container.querySelector('button')).toBe(neighbor)
  expect(errors).toEqual([])
})

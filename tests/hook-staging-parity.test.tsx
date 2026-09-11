import { afterEach, expect, it, vi } from 'vitest'
import { Suspense, useEffect, useInsertionEffect, useLayoutEffect, useReducer, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let mounted = true
  const unmount = () => {
    if (!mounted) return
    mounted = false
    flushSync(() => root.unmount())
    container.remove()
  }
  cleanups.push(unmount)
  return { container, unmount, render: (node: ReactNode) => flushSync(() => root.render(node)) }
}

it('does not publish any effect phase from a reducer bailout before the next real update', async () => {
  const { container, render, unmount } = setup()
  const created: string[][] = [[], [], []], destroyed: string[][] = [[], [], []]
  let dependency = 'initial'
  let dispatch!: (change: boolean) => void
  function App() {
    const [value, update] = useReducer((state: number, change: boolean) => state + Number(change), 0)
    dispatch = update
    const current = dependency
    useInsertionEffect(() => { created[0]!.push(current); return () => { destroyed[0]!.push(current) } }, [current])
    useLayoutEffect(() => { created[1]!.push(current); return () => { destroyed[1]!.push(current) } }, [current])
    useEffect(() => { created[2]!.push(current); return () => { destroyed[2]!.push(current) } }, [current])
    return <b>{value}</b>
  }
  render(<App />)
  await vi.waitFor(() => expect(created[2]).toEqual(['initial']))
  dependency = 'next'
  flushSync(() => dispatch(false))
  await Promise.resolve()
  expect(container.textContent).toBe('0')
  expect(created).toEqual([['initial'], ['initial'], ['initial']])
  expect(destroyed).toEqual([[], [], []])
  dependency = 'final'
  flushSync(() => dispatch(true))
  await vi.waitFor(() => expect(created[2]).toEqual(['initial', 'final']))
  expect(container.textContent).toBe('1')
  expect(created).toEqual([['initial', 'final'], ['initial', 'final'], ['initial', 'final']])
  expect(destroyed).toEqual([['initial'], ['initial'], ['initial']])
  unmount()
  expect(destroyed).toEqual([['initial', 'final'], ['initial', 'final'], ['initial', 'final']])
})

it('preserves staged client effects around a nested server failure and a render-phase retry', async () => {
  const { container, render } = setup()
  const failure = Error('nested server render failed')
  const serverEffect = vi.fn()
  const caught: unknown[] = [], layouts: number[] = [], passives: number[] = []
  function Server(): ReactNode {
    useState('server')
    useLayoutEffect(serverEffect, [])
    throw failure
  }
  function App({ target }: { target: number }) {
    const [value, update] = useState(0)
    useLayoutEffect(() => { layouts.push(value) })
    try { renderToString(<Server />) } catch (error) { caught.push(error) }
    useEffect(() => { passives.push(value) }, [value])
    if (value !== target) update(target)
    return <b>{value}</b>
  }
  render(<App target={0} />)
  await vi.waitFor(() => expect(passives).toEqual([0]))
  render(<App target={3} />)
  await vi.waitFor(() => expect(passives).toEqual([0, 3]))
  expect(container.textContent).toBe('3')
  expect(layouts).toEqual([0, 3])
  expect(caught.length).toBeGreaterThanOrEqual(3)
  expect(caught.every(error => error === failure)).toBe(true)
  expect(serverEffect).not.toHaveBeenCalled()
})

it('discards an abandoned subscription change and installs it once after a successful retry', async () => {
  const { container, render, unmount } = setup()
  const pending = new Promise<void>(() => {})
  const subscribed: string[] = [], unsubscribed: string[] = []
  const subscribeA = () => { subscribed.push('a'); return () => { unsubscribed.push('a') } }
  const subscribeB = () => { subscribed.push('b'); return () => { unsubscribed.push('b') } }
  const getSnapshot = () => 'value'
  function Child({ changed, blocked }: { changed: boolean; blocked: boolean }) {
    const value = useSyncExternalStore(changed ? subscribeB : subscribeA, getSnapshot)
    if (blocked) throw pending
    return <b>{value}</b>
  }
  const view = (changed: boolean, blocked: boolean) => <Suspense fallback={<i>loading</i>}>
    <Child changed={changed} blocked={blocked} />
  </Suspense>
  render(view(false, false))
  await vi.waitFor(() => expect(subscribed).toEqual(['a']))
  render(view(true, true))
  expect(container.querySelector('i')?.textContent).toBe('loading')
  expect(subscribed).toEqual(['a'])
  expect(unsubscribed).toEqual([])
  render(view(false, false))
  expect(container.textContent).toBe('value')
  await Promise.resolve()
  expect(subscribed).toEqual(['a'])
  expect(unsubscribed).toEqual([])
  render(view(true, false))
  await vi.waitFor(() => expect(subscribed).toEqual(['a', 'b']))
  expect(unsubscribed).toEqual(['a'])
  unmount()
  expect(unsubscribed).toEqual(['a', 'b'])
})

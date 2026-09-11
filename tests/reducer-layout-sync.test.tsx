import { afterEach, expect, it } from 'vitest'
import { Suspense, useReducer } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

it.each([1, 10])('keeps dispatch synchronous without consuming actions before a factor %s reveal', revealFactor => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  const pending = new Promise<void>(() => {})
  const reducers: number[] = []
  let dispatch!: (action: number) => void
  function Counter({ factor }: { factor: number }) {
    const [value, send] = useReducer((state: number, action: number) => { reducers.push(factor); return state + action * factor }, 0)
    dispatch = send
    return <b>{value}</b>
  }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const render = (factor: number, blocked: boolean) => flushSync(() => root.render(<Suspense fallback={<i>loading</i>}><Counter factor={factor} /><Gate blocked={blocked} /></Suspense>))
  render(1, false)
  const first = dispatch
  flushSync(() => first(2))
  render(10, true)
  reducers.length = 0
  flushSync(() => {
    first(1)
    expect(reducers).toEqual([])
  })
  expect(reducers.length).toBeGreaterThan(0)
  expect(reducers.every(factor => factor === 10)).toBe(true)
  expect(container.querySelector('b')?.textContent).toBe('2')
  expect((container.querySelector('b') as HTMLElement).style.display).toBe('none')
  render(revealFactor, false)
  expect(dispatch).toBe(first)
  expect(container.textContent).toBe(String(2 + revealFactor))
  expect(container.querySelector('i')).toBeNull()
})

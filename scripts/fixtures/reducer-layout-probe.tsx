// Diagnostic comparison for eager Redact dispatch versus React's queued actions.
// Run with reducer-layout-probe.config.mjs, optionally REACT_REFERENCE or REDACT_SOURCE.
import { afterEach, expect, it } from 'vitest'
import { Suspense, useReducer } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

it.each([1, 10])('reports retained dispatch behavior when revealing factor %s', revealFactor => {
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
  expect(container.textContent).toBe('2')
  render(10, true)
  expect(container.querySelector('i')?.textContent).toBe('loading')
  reducers.length = 0
  flushSync(() => first(1))
  const pendingValue = container.querySelector('b')?.textContent
  const pendingReducers = reducers.slice()
  expect((container.querySelector('b') as HTMLElement).style.display).toBe('none')
  render(revealFactor, false)
  expect(dispatch).toBe(first)
  console.log(JSON.stringify({ revealFactor, pendingValue, pendingReducers, finalValue: container.textContent, fallbackRemaining: !!container.querySelector('i'), allReducers: reducers }))
})

import { afterEach, expect, it, vi } from 'vitest'
import { Activity, Suspense, useEffect, useLayoutEffect, useReducer, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { Dispatch, ReactNode, SetStateAction } from 'react'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: ReactNode) => flushSync(() => root.render(node)) }
}

it('keeps dispatch identity while adopting the reducer from a successful prop update', () => {
  const { container, render } = setup()
  let dispatch!: Dispatch<number>
  function Counter({ factor }: { factor: number }) {
    const [value, send] = useReducer((state: number, action: number) => state + action * factor, 0)
    dispatch = send
    return <b>{value}</b>
  }
  render(<Counter factor={1} />)
  const first = dispatch
  flushSync(() => first(2))
  expect(container.textContent).toBe('2')
  render(<Counter factor={10} />)
  expect(dispatch).toBe(first)
  flushSync(() => first(3))
  expect(container.textContent).toBe('32')
  expect(dispatch).toBe(first)
})

it('keeps retained dispatch valid when a suspended reducer change is abandoned', () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  let dispatch!: Dispatch<number>
  function Counter({ factor }: { factor: number }) {
    const [value, send] = useReducer((state: number, action: number) => state + action * factor, 0)
    dispatch = send
    return <b>{value}</b>
  }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (factor: number, blocked: boolean) => <Suspense fallback={<i>loading</i>}><Counter factor={factor} /><Gate blocked={blocked} /></Suspense>
  render(view(1, false))
  const first = dispatch
  flushSync(() => first(2))
  render(view(10, true))
  expect(dispatch).toBe(first)
  expect(container.querySelector('i')?.textContent).toBe('loading')
  flushSync(() => first(1))
  expect((container.querySelector('b') as HTMLElement).style.display).toBe('none')
  expect(container.querySelector('i')?.textContent).toBe('loading')
  render(view(1, false))
  expect(container.textContent).toBe('3')
  expect(dispatch).toBe(first)
  render(view(10, false))
  flushSync(() => first(1))
  expect(container.textContent).toBe('13')
})

it.each([1, 10])('removes the retained fallback when an urgent prop reveal selects reducer factor %s', revealFactor => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  let dispatch!: Dispatch<number>
  const fallbackCleanup = vi.fn()
  function Fallback() { useLayoutEffect(() => fallbackCleanup, []); return <i>loading</i> }
  function Counter({ factor }: { factor: number }) {
    const [value, send] = useReducer((state: number, action: number) => state + action * factor, 0)
    dispatch = send
    return <b data-factor={factor}>{value}</b>
  }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (factor: number, blocked: boolean) => <Suspense fallback={<Fallback />}><Counter factor={factor} /><Gate blocked={blocked} /></Suspense>
  render(view(1, false))
  const first = dispatch, primary = container.querySelector('b')!
  flushSync(() => first(2))
  render(view(10, true))
  flushSync(() => first(1))
  expect(primary.textContent).toBe('2')
  expect(primary.style.display).toBe('none')
  expect(container.querySelector('i')?.textContent).toBe('loading')
  render(view(revealFactor, false))
  expect(dispatch).toBe(first)
  expect(container.querySelector('b')).toBe(primary)
  expect(primary.style.display).toBe('')
  expect(primary.getAttribute('data-factor')).toBe(String(revealFactor))
  expect(container.querySelector('i')).toBeNull()
  expect(fallbackCleanup).toHaveBeenCalledTimes(1)
  expect(primary.textContent).toBe(String(2 + revealFactor))
})

it('keeps lazy state and dispatch identities separate from effect slots through Activity', async () => {
  const { container, render } = setup()
  const init = vi.fn(() => 7)
  const effects: string[] = []
  let set!: Dispatch<SetStateAction<number>>, dispatch!: Dispatch<number>
  function Child({ label }: { label: string }) {
    const [state, update] = useState(init); set = update
    useLayoutEffect(() => { effects.push(`layout:${label}`); return () => { effects.push(`unlayout:${label}`) } }, [label])
    const [sum, send] = useReducer((value: number, action: number) => value + action, 1); dispatch = send
    useEffect(() => { effects.push(`passive:${label}`); return () => { effects.push(`unpassive:${label}`) } }, [label])
    return <b>{state}:{sum}</b>
  }
  const view = (mode: 'visible' | 'hidden', label: string) => <Activity mode={mode}><Child label={label} /></Activity>
  render(view('visible', 'one'))
  await vi.waitFor(() => expect(effects).toContain('passive:one'))
  const firstSet = set, firstDispatch = dispatch
  flushSync(() => { firstSet(value => value + 1); firstDispatch(2) })
  expect(container.textContent).toBe('8:3')
  expect(init).toHaveBeenCalledTimes(1)
  render(view('hidden', 'two'))
  await vi.waitFor(() => expect(effects).toContain('unpassive:one'))
  render(view('visible', 'three'))
  await vi.waitFor(() => expect(effects).toContain('passive:three'))
  expect(init).toHaveBeenCalledTimes(1)
  expect(set).toBe(firstSet)
  expect(dispatch).toBe(firstDispatch)
  expect(container.textContent).toBe('8:3')
  expect(effects).toEqual(['layout:one', 'passive:one', 'unlayout:one', 'unpassive:one', 'layout:three', 'passive:three'])
  flushSync(() => { firstSet(value => value + 1); firstDispatch(4) })
  expect(container.textContent).toBe('9:7')
})

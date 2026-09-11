import { afterEach, describe, expect, it, vi } from 'vitest'
import { Suspense, memo, useEffect, useInsertionEffect, useLayoutEffect, useReducer, useRef, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: ReactNode) => flushSync(() => root.render(node)) }
}

// These cases originally failed in the frozen Redact expansion and pass in
// pinned React. Keep the exact expectations as permanent regression tests.
describe('dependencies and retained closures after a no-op bailout', () => {
  it.each(['external variable', 'ref'] as const)('retains accepted dependencies read via %s without publishing effects', async source => {
    const { container, render } = setup()
    const created: string[][] = [[], [], []], destroyed: string[][] = [[], [], []]
    let external = 'initial', cell!: { current: string }, dispatch!: (change: boolean) => void
    function App() {
      const [value, update] = useReducer((state: number, change: boolean) => state + Number(change), 0)
      dispatch = update
      cell = useRef('initial')
      const dependency = source === 'ref' ? cell.current : external
      useInsertionEffect(() => { created[0]!.push(dependency); return () => { destroyed[0]!.push(dependency) } }, [dependency])
      useLayoutEffect(() => { created[1]!.push(dependency); return () => { destroyed[1]!.push(dependency) } }, [dependency])
      useEffect(() => { created[2]!.push(dependency); return () => { destroyed[2]!.push(dependency) } }, [dependency])
      return <b>{value}</b>
    }
    render(<App />)
    await vi.waitFor(() => expect(created[2]).toEqual(['initial']))
    external = cell.current = 'next'
    flushSync(() => dispatch(false))
    await Promise.resolve()
    expect(created).toEqual([['initial'], ['initial'], ['initial']])
    expect(destroyed).toEqual([[], [], []])
    flushSync(() => dispatch(true))
    await Promise.resolve()
    expect(container.textContent).toBe('1')
    // Pinned React keeps the dependency accepted during the bailed-out render.
    // Reusing it in the next successful render does not install the effect.
    expect(created).toEqual([['initial'], ['initial'], ['initial']])
    expect(destroyed).toEqual([[], [], []])
  })

  it.each([false, true])('uses the appropriate retained layout closure on Suspense reconnect, interveningUpdate=%s', interveningUpdate => {
    const { container, render } = setup()
    const pending = new Promise<void>(() => {})
    const created: string[] = [], destroyed: string[] = [], renders: string[] = []
    let cell!: { current: string }, dispatch!: (change: boolean) => void
    const Child = memo(function Child() {
      const [value, update] = useReducer((state: number, change: boolean) => state + Number(change), 0)
      dispatch = update
      cell = useRef('initial')
      const dependency = cell.current
      renders.push(`${value}:${dependency}`)
      useLayoutEffect(() => {
        created.push(dependency)
        return () => { destroyed.push(dependency) }
      }, [dependency])
      return <b>{value}</b>
    })
    function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
    const child = <Child />
    const view = (blocked: boolean) => <Suspense fallback={<i>loading</i>}>{child}<Gate blocked={blocked} /></Suspense>
    render(view(false))
    cell.current = 'next'
    flushSync(() => dispatch(false))
    if (interveningUpdate) flushSync(() => dispatch(true))
    const before = { created: [...created], destroyed: [...destroyed] }
    render(view(true))
    expect(container.querySelector('i')?.textContent).toBe('loading')
    render(view(false))
    expect({ before, created, destroyed, renders }).toEqual({
      before: { created: ['initial'], destroyed: [] },
      created: ['initial', interveningUpdate ? 'next' : 'initial'],
      destroyed: ['initial'],
      renders: ['0:initial', '0:next', ...(interveningUpdate ? ['1:next'] : [])],
    })
    expect(container.textContent).toBe(interveningUpdate ? '1' : '0')
  })
})

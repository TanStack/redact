import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
function setup() {
  const container = document.body.appendChild(document.createElement('div'))
  const errors: unknown[] = []
  const root = createRoot(container, { onUncaughtError: error => errors.push(error) })
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, errors, render: (element: React.ReactNode) => flushSync(() => root.render(element)) }
}
for (const activity of [false, true]) for (const passive of [false, true]) it(`settles a cached child's ${passive ? 'passive' : 'layout'} effect publishing parent state, activity=${activity}`, async () => {
  const { render, errors } = setup()
  let childRenders = 0, effects = 0, parentRenders = 0
  function Child({ onSnapshot }: { onSnapshot: (value: unknown) => void }) {
    childRenders++
    if (childRenders > 6) throw new Error('Fixture render limit exceeded')
    const useEffect = passive ? React.useEffect : React.useLayoutEffect
    useEffect(() => { effects++; onSnapshot({ at: childRenders }) })
    return null
  }
  function Parent() {
    parentRenders++
    const [, setSnapshot] = React.useState<unknown>(null)
    const onSnapshot = React.useMemo(() => (value: unknown) => setSnapshot(value), [])
    const child = React.useMemo(() => <Child onSnapshot={onSnapshot} />, [onSnapshot])
    return activity ? <React.Activity mode="visible">{child}</React.Activity> : child
  }
  render(<Parent />)
  await vi.waitFor(() => expect([childRenders, effects, parentRenders]).toEqual([1, 1, 2]))
  expect(errors).toEqual([])
})
it('lets a cached child update itself without restarting the parent publication loop', () => {
  const { render, container, errors } = setup()
  let childRenders = 0, effects = 0
  let update!: () => void
  function Child({ publish }: { publish: (value: unknown) => void }) {
    childRenders++
    const [value, setValue] = React.useState(0)
    update = () => setValue(n => n + 1)
    React.useLayoutEffect(() => { effects++; publish({ value }) })
    return <p>{value}</p>
  }
  function Parent() {
    const [, setSnapshot] = React.useState<unknown>(null)
    return React.useMemo(() => <Child publish={setSnapshot} />, [])
  }
  render(<Parent />)
  flushSync(update)
  expect(container.textContent).toBe('1')
  expect([childRenders, effects]).toEqual([2, 2])
  expect(errors).toEqual([])
})

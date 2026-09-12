import { afterEach, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'

const roots: Array<[Root, HTMLDivElement]> = []
afterEach(() => {
  for (const [root, container] of roots.splice(0)) {
    flushSync(() => root.unmount())
    container.remove()
  }
})

it.each(['state', 'store'] as const)('updates a pending %s parent before propagating context to its old child', source => {
  const Context = React.createContext(0)
  const records = new Map([[0, 'first']])
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  let snapshot = 0
  const getSnapshot = () => snapshot
  let setContext!: React.Dispatch<React.SetStateAction<number>>
  let setParent!: React.Dispatch<React.SetStateAction<number>>
  let stableRenders = 0
  const errors: unknown[] = []
  const reads: number[] = []
  function Child({ id }: { id: number }) {
    React.useContext(Context)
    reads.push(id)
    if (!records.has(id)) throw new Error(`Stale child: ${id}`)
    return <b>{records.get(id)}</b>
  }
  const Parent = React.memo(function Parent() {
    const [state, update] = React.useState(0)
    setParent = update
    const external = React.useSyncExternalStore(subscribe, getSnapshot)
    return <Child id={source === 'state' ? state : external} />
  })
  const Stable = React.memo(function Stable() {
    stableRenders++
    return <div><Parent /></div>
  })
  function App() {
    const [value, update] = React.useState(0)
    setContext = update
    return <Context.Provider value={value}><Stable /></Context.Provider>
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container, { onUncaughtError: error => { errors.push(error) } })
  roots.push([root, container])
  flushSync(() => root.render(<App />))
  flushSync(() => {
    records.delete(0)
    records.set(1, 'second')
    snapshot = 1
    if (source === 'state') setParent(1)
    else for (const listener of listeners) listener()
    setContext(1)
  })
  expect(errors).toEqual([])
  expect(reads).toEqual([0, 1])
  expect(container.textContent).toBe('second')
  expect(stableRenders).toBe(1)
})

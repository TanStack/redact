import { expect, it } from 'vitest'
import { Suspense, startTransition, useEffect, useState, useSyncExternalStoreWithSelector } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

it('keeps the committed selection identity when a replacement selector suspends', async () => {
  const snapshot = { count: 0 }
  const subscribe = () => () => {}
  const getSnapshot = () => snapshot
  const selections: Array<{ count: number }> = []
  const committed: Array<{ count: number }> = []
  const pending = new Promise<void>(() => {})
  let firstCommit!: () => void, attemptedSuspend!: () => void
  const initialCommit = new Promise<void>(resolve => { firstCommit = resolve })
  const suspendedAttempt = new Promise<void>(resolve => { attemptedSuspend = resolve })
  function App({ version }: { version: number }) {
    const value = useSyncExternalStoreWithSelector(subscribe, getSnapshot, undefined,
      () => ({ count: version === 1 ? 1 : 0 }), (a, b) => a.count === b.count)
    selections.push(value)
    useEffect(() => { committed.push(value); firstCommit() }, [value])
    if (version === 1) { attemptedSuspend(); throw pending }
    return <b>{value.count}</b>
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let update!: (version: number) => void
  function Shell() {
    const [version, setVersion] = useState(0)
    update = setVersion
    return <Suspense fallback={<i>pending</i>}><App version={version} /></Suspense>
  }
  try {
    flushSync(() => root.render(<Shell />))
    await initialCommit
    const original = selections.at(-1)
    expect(committed).toEqual([original])
    startTransition(() => update(1))
    await suspendedAttempt
    expect(selections.some(value => value.count === 1)).toBe(true)
    expect(container.querySelector('b')?.textContent).toBe('0')
    flushSync(() => update(2))
    await tick()
    expect(container.textContent).toBe('0')
    expect(committed).toHaveLength(1)
    expect(selections.at(-1)).toBe(original)
    expect(committed).toEqual([original])
  } finally {
    root.unmount()
    container.remove()
  }
})

it('retains the latest committed selection across back-to-back synchronous selectors', async () => {
  const snapshot = { count: 0 }, subscribe = () => () => {}, get = () => snapshot
  const seen: Array<{ count: number }> = [], effects: Array<{ count: number }> = []
  let update!: (version: number) => void, mounted!: () => void
  const initial = new Promise<void>(resolve => { mounted = resolve })
  function App() {
    const [version, setVersion] = useState(0)
    update = setVersion
    const value = useSyncExternalStoreWithSelector(subscribe, get, undefined,
      () => ({ count: version > 0 ? 1 : 0 }), (a, b) => a.count === b.count)
    seen.push(value)
    useEffect(() => { effects.push(value); mounted() }, [value])
    return <b>{value.count}</b>
  }
  const container = document.createElement('div'), root = createRoot(container)
  try {
    flushSync(() => root.render(<App />))
    await initial
    flushSync(() => update(1))
    const committed = seen.at(-1)
    flushSync(() => update(2))
    await tick()
    expect(container.textContent).toBe('1')
    expect(seen.at(-1)).toBe(committed)
    expect(effects).toHaveLength(2)
  } finally { root.unmount() }
})

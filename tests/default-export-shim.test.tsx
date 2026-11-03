import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

// zustand reads the aliased `use-sync-external-store` shims as CJS default
// imports, so the helpers have to be on the default export too.
const { useSyncExternalStore, useSyncExternalStoreWithSelector } = React

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function createStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    setState(next: T) {
      state = next
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

describe('external store helpers on the default export', () => {
  it('exposes both shim entry points', () => {
    expect(typeof useSyncExternalStore).toBe('function')
    expect(typeof useSyncExternalStoreWithSelector).toBe('function')
  })

  it('renders and updates through the selector helper', () => {
    const store = createStore({ count: 0, other: 'x' })
    const container = document.createElement('div')
    const root = createRoot(container)
    cleanups.push(() => {
      flushSync(() => root.unmount())
    })

    let renders = 0
    function Counter() {
      renders += 1
      const count = useSyncExternalStoreWithSelector(
        store.subscribe,
        store.getState,
        store.getState,
        (state) => state.count,
      )
      return <span>{count}</span>
    }

    flushSync(() => root.render(<Counter />))
    expect(container.textContent).toBe('0')

    flushSync(() => store.setState({ count: 1, other: 'x' }))
    expect(container.textContent).toBe('1')

    const before = renders
    flushSync(() => store.setState({ count: 1, other: 'y' }))
    expect(container.textContent).toBe('1')
    expect(renders).toBe(before)
  })
})

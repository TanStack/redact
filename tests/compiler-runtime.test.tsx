/**
 * react/compiler-runtime contract.
 *
 * The React Compiler emits `import { c } from 'react/compiler-runtime'` and
 * calls `c(size)` at the top of compiled components to get a per-instance
 * memo cache. Slots start as the well-known sentinel
 * `Symbol.for('react.memo_cache_sentinel')`. The compiled code overwrites
 * slots with computed values and uses sentinel identity to detect first-run
 * and dependency changes. The cache must persist across re-renders of the
 * same component instance.
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { c } from '@tanstack/redact/compiler-runtime'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const MEMO_CACHE_SENTINEL = Symbol.for('react.memo_cache_sentinel')

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

describe('react/compiler-runtime', () => {
  it('returns an array of the requested size filled with the canonical sentinel', () => {
    const seenCaches: Array<Array<unknown>> = []

    function Probe() {
      const cache = c(4)
      seenCaches.push(cache)
      return <div />
    }

    const container = setup()
    const root = createRoot(container)
    flushSync(() => root.render(<Probe />))

    expect(seenCaches.length).toBe(1)
    expect(seenCaches[0]!.length).toBe(4)
    expect(seenCaches[0]!.every((slot) => slot === MEMO_CACHE_SENTINEL)).toBe(true)
  })

  it('returns the same cache array across re-renders of the same component instance', () => {
    let renderCount = 0
    const seenCaches: Array<Array<unknown>> = []

    function Probe({ tick }: { tick: number }) {
      renderCount++
      const cache = c(2)
      seenCaches.push(cache)
      return <div data-tick={tick} />
    }

    const container = setup()
    const root = createRoot(container)
    flushSync(() => root.render(<Probe tick={0} />))
    flushSync(() => root.render(<Probe tick={1} />))
    flushSync(() => root.render(<Probe tick={2} />))

    expect(renderCount).toBe(3)
    expect(seenCaches[0]).toBe(seenCaches[1])
    expect(seenCaches[1]).toBe(seenCaches[2])
  })

  it('preserves user-written slot values across re-renders (compiler memoization shape)', () => {
    let computeCount = 0

    function Probe({ a, b }: { a: number; b: number }) {
      const $ = c(3)
      // Slot 0/1 are dependency tracking; slot 2 caches the result.
      let value: number
      if ($[0] !== a || $[1] !== b) {
        $[0] = a
        $[1] = b
        computeCount++
        value = a + b
        $[2] = value
      } else {
        value = $[2] as number
      }
      return <div data-value={value} />
    }

    const container = setup()
    const root = createRoot(container)

    flushSync(() => root.render(<Probe a={1} b={2} />))
    expect(container.querySelector('div')!.getAttribute('data-value')).toBe('3')
    expect(computeCount).toBe(1)

    // Same deps → no recompute.
    flushSync(() => root.render(<Probe a={1} b={2} />))
    expect(computeCount).toBe(1)

    // Different deps → recompute.
    flushSync(() => root.render(<Probe a={5} b={7} />))
    expect(container.querySelector('div')!.getAttribute('data-value')).toBe('12')
    expect(computeCount).toBe(2)
  })

  it('gives sibling component instances independent caches', () => {
    const caches: Array<Array<unknown>> = []
    function Probe({ id }: { id: string }) {
      caches.push(c(1))
      return <span data-id={id} />
    }
    function App() {
      return (
        <div>
          <Probe id="a" />
          <Probe id="b" />
        </div>
      )
    }
    const container = setup()
    const root = createRoot(container)
    flushSync(() => root.render(<App />))

    expect(caches.length).toBe(2)
    expect(caches[0]).not.toBe(caches[1])
  })
})

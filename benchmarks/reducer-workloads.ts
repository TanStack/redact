import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const h = React.createElement
const rowCount = 96
const modulus = 1_000_003

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('Reducer benchmark correctness failure: ' + message)
}

function fixture(suspense: boolean) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const dispatches: React.Dispatch<number>[] = []
  const pending = new Promise<void>(() => {})
  const nodes: HTMLElement[] = []
  const expectedValues = Array.from({ length: rowCount }, (_, id) => id)
  const commits = new Uint32Array(rowCount)
  const cleanups = new Uint32Array(rowCount)
  const connected = new Array<boolean>(rowCount).fill(false)
  let primary: HTMLElement
  let setGateBlocked!: React.Dispatch<React.SetStateAction<boolean>>
  let expectedCommits = 1
  let allowLayout = true
  let failure: string | undefined
  let layoutDomChecks = 0
  let fallbackMounts = 0
  let fallbackUnmounts = 0
  let suspensions = 0
  let independentSuspensions = 0
  let independentPending = false
  let hiddenChecks = 0
  const record = (condition: unknown, message: string, id?: number) => {
    if (!condition && !failure) failure = (id === undefined ? '' : `row ${id}: `) + message
  }
  const disconnects = Array.from({ length: rowCount }, (_, id) => () => {
    record(connected[id], 'layout cleanup must disconnect a connected effect', id)
    connected[id] = false
    cleanups[id]!++
  })
  function Counter({ id, factor }: { id: number, factor: number }) {
    // Multiplication makes action order observable. The modulus keeps long
    // runs inside exact integer arithmetic, and each row starts differently.
    const [value, dispatch] = React.useReducer((value: number, action: number) => (value * 2 + action * factor) % modulus, id)
    dispatches[id] = dispatch
    React.useLayoutEffect(() => {
      commits[id]!++
      record(allowLayout && commits[id] === expectedCommits, 'unexpected intermediate layout commit', id)
      record(value === expectedValues[id], 'unexpected intermediate reducer value', id)
      const node = nodes[id] ||= container.querySelector<HTMLElement>(`[data-reducer-row="${id}"]`)!
      primary ||= node?.parentElement!
      layoutDomChecks++
      record(node && node.textContent === `${id}:${value}` && node.isConnected && node.parentElement === primary && primary.parentElement === container && primary.style.display !== 'none', 'layout callback must see its committed DOM and visible primary', id)
      record(!connected[id], 'layout effect must not connect twice', id)
      connected[id] = true
      return disconnects[id]
    }, [value])
    return h('b', { 'data-reducer-row': id }, `${id}:${value}`)
  }
  function Gate({ blocked }: { blocked: boolean }) {
    const [independent, setBlocked] = React.useState(false)
    setGateBlocked = setBlocked
    if (blocked || independent) throw pending
    return null
  }
  function Fallback() {
    React.useLayoutEffect(() => {
      fallbackMounts++
      record(!allowLayout && container.querySelector('[data-reducer-fallback]')?.textContent === 'pending', 'fallback layout callback must see the committed fallback')
      return () => { fallbackUnmounts++ }
    }, [])
    return h('i', { 'data-reducer-fallback': '' }, 'pending')
  }
  const view = (factor: number, blocked = false) => {
    const rows = h('div', { 'data-reducer-primary': '' }, Array.from({ length: rowCount }, (_, id) => h(Counter, { key: id, id, factor })), h(Gate, { blocked }))
    return suspense ? h(React.Suspense, { fallback: h(Fallback, null) }, rows) : rows
  }
  const render = (factor: number, blocked = false) => flushSync(() => root.render(view(factor, blocked)))
  render(1)
  const retained = dispatches.slice()
  const checkVisible = () => {
    assert(!failure, failure || 'layout callbacks')
    assert(primary?.parentElement === container && primary.style.display !== 'none' && container.querySelector('[data-reducer-fallback]') === null, 'primary visible without fallback')
    assert(fallbackUnmounts === suspensions, 'each revealed fallback has unmounted')
  }
  return {
    dispatches,
    expectCommit(multiplier: number, increment: number) {
      expectedCommits++
      allowLayout = true
      for (let id = 0; id < rowCount; id++) expectedValues[id] = (expectedValues[id]! * multiplier + increment) % modulus
    },
    suspend(independent: boolean) {
      allowLayout = false
      suspensions++
      if (independent) {
        independentSuspensions++
        independentPending = true
        flushSync(() => setGateBlocked(true))
      } else render(1, true)
    },
    reveal(factor: number) {
      flushSync(() => {
        if (independentPending) {
          setGateBlocked(false)
          independentPending = false
        }
        root.render(view(factor))
      })
      checkVisible()
    },
    checkHidden() {
      assert(!failure, failure || 'layout callbacks')
      assert(primary?.parentElement === container && primary.style.display === 'none', 'primary must be hidden during every pending attempt')
      const fallback = container.querySelector<HTMLElement>('[data-reducer-fallback]')
      assert(fallback?.parentElement === container && fallback.textContent === 'pending' && fallback.style.display !== 'none', 'fallback must be committed during every pending attempt')
      assert(nodes.length === rowCount && nodes.every((node, id) => node.parentElement === primary && node.textContent === `${id}:${expectedValues[id]}`), 'hidden primary keeps every previously committed row value')
      assert(commits.every((count, id) => count === expectedCommits && cleanups[id] === count && !connected[id]), 'hidden primary has no premature commits and every layout effect is disconnected')
      assert(fallbackMounts === suspensions && fallbackUnmounts === suspensions - 1, 'pending retries retain the same committed fallback')
      hiddenChecks++
    },
    validate(iterations: number, cycles = 0) {
      checkVisible()
      const actual = Array.from(container.querySelectorAll('[data-reducer-row]'))
      assert(actual.length === rowCount && actual.every((node, id) => node === nodes[id] && node.textContent === `${id}:${expectedValues[id]}`), 'all final states and DOM identities')
      assert(dispatches.length === rowCount && dispatches.every((dispatch, id) => dispatch === retained[id]), 'retained dispatch identities')
      assert(expectedCommits === iterations + 1 && commits.every(count => count === expectedCommits), 'each row commits every expected intermediate value exactly once')
      assert(connected.every(Boolean) && cleanups.every(count => count === iterations), 'each row reconnects after its previous layout cleanup')
      assert(layoutDomChecks === rowCount * expectedCommits, 'every row commit checks the actual DOM')
      assert(suspensions === cycles && fallbackMounts === cycles && fallbackUnmounts === cycles && hiddenChecks === cycles * 2, 'every retry completes its hide, pending update, and reveal')
      assert(independentSuspensions === Math.min(cycles, 1), 'retry workload includes one independently triggered suspension')
      return {
        checks: 10,
        diagnostics: {
          layoutCommits: commits.reduce((total, count) => total + count, 0),
          layoutCleanups: cleanups.reduce((total, count) => total + count, 0),
          minRowCommits: Math.min(...commits),
          maxRowCommits: Math.max(...commits),
          layoutDomChecks, fallbackMounts, fallbackUnmounts, hiddenChecks, independentSuspensions,
          firstRowValue: expectedValues[0]!, lastRowValue: expectedValues[rowCount - 1]!,
        },
      }
    },
    cleanup() {
      try { flushSync(() => root.unmount()) } finally { container.remove() }
      assert(!failure, failure || 'layout callbacks')
      assert(connected.every(value => !value) && cleanups.every((count, id) => count === commits[id]), 'unmount disconnects every committed layout effect exactly once')
    },
  }
}

async function batches(iterations: number, suspense: boolean) {
  const state = fixture(suspense)
  try {
    const start = performance.now()
    for (let tick = 0; tick < iterations; tick++) {
      // Applying [1, 2, -1] in order is 8 * previous + 7.
      state.expectCommit(8, 7)
      flushSync(() => {
        for (const dispatch of state.dispatches) { dispatch(1); dispatch(2); dispatch(-1) }
      })
    }
    const durationMs = performance.now() - start
    return { durationMs, operations: iterations * rowCount * 3, ...state.validate(iterations) }
  } finally { state.cleanup() }
}

async function retries(iterations: number) {
  const state = fixture(true)
  try {
    const start = performance.now()
    for (let tick = 0; tick < iterations; tick++) {
      const factor = tick % 4 + 2
      // One cycle starts from a child state dispatch, without a root render.
      state.suspend(tick === 0)
      state.checkHidden()
      flushSync(() => { for (const dispatch of state.dispatches) { dispatch(1); dispatch(2) } })
      state.checkHidden()
      // Applying [1, 2] with the revealing reducer is 4 * previous + 4 * factor.
      state.expectCommit(4, factor * 4)
      state.reveal(factor)
    }
    const durationMs = performance.now() - start
    return { durationMs, operations: iterations * rowCount * 2, ...state.validate(iterations, iterations) }
  } finally { state.cleanup() }
}

// Opt-in because historical eager-reducer builds cannot pass the retry case.
// Layout callbacks verify each intermediate state against committed DOM.
// This shared instrumentation is part of the timed work in both runtimes.
// Operations count dispatched reducer actions, not renders or DOM commits.
export const reducerWorkloads = [
  { name: 'reducer-batches', mode: 'sync' as const, defaultIterations: 80, optIn: true, execute: (iterations: number) => batches(iterations, false) },
  { name: 'reducer-suspense-updates', mode: 'sync' as const, defaultIterations: 60, optIn: true, execute: (iterations: number) => batches(iterations, true) },
  { name: 'reducer-suspense-retries', mode: 'sync' as const, defaultIterations: 20, optIn: true, execute: retries },
]

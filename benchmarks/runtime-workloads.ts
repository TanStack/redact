import * as React from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'
import { reducerWorkloads } from './reducer-workloads'

const h = React.createElement
type Mode = 'sync' | 'async'
type Setter = (value: number) => void
type Result = {
  name: string
  mode: Mode
  iterations: number
  durationMs: number
  operations: number
  checks: number
  diagnostics?: Record<string, number>
}
type Workload = {
  name: string
  mode: Mode
  defaultIterations: number
  optIn?: boolean
  execute: (iterations: number) => Promise<Omit<Result, 'name' | 'mode' | 'iterations'>>
}

async function contextPropagation(iterations: number) {
  const Scope = React.createContext(0)
  const leafCount = 180
  const leafIds = Array.from({ length: leafCount }, (_, id) => id)
  let outerRenders = 0
  let innerRenders = 0
  let staticRenders = 0
  let consumerRenders = 0
  const consumerCounts = new Array<number>(leafCount).fill(0)
  const StaticLeaf = React.memo(function StaticLeaf({ id }: { id: number }) {
    staticRenders++
    return jsx('i', { 'data-static-id': id, children: `static:${id}` })
  })
  const Consumer = React.memo(function Consumer({ id }: { id: number }) {
    consumerRenders++
    consumerCounts[id]!++
    const value = React.useContext(Scope)
    return jsx('span', { 'data-context-id': id, children: `${id}:${value}` })
  })
  const Inner = React.memo(function Inner({ id }: { id: number }) {
    innerRenders++
    return jsxs('section', { children: [jsx(StaticLeaf, { id }), jsx(Consumer, { id })] })
  })
  const Outer = React.memo(function Outer({ id }: { id: number }) {
    outerRenders++
    return jsx(Inner, { id })
  })
  const view = (value: number) => jsx(Scope.Provider, {
    value,
    children: jsx('div', { children: leafIds.map(id => jsx(Outer, { id }, id)) }),
  })
  const state = mounted(view(0))
  const original = Array.from(state.container.querySelectorAll('[data-context-id]'))
  try {
    const start = performance.now()
    for (let tick = 1; tick <= iterations; tick++) flushSync(() => state.root.render(view(tick)))
    const durationMs = performance.now() - start
    assert(outerRenders === leafCount && innerRenders === leafCount, 'context changes do not rerender equal-prop memo wrappers')
    assert(staticRenders === leafCount, 'context changes do not rerender nonconsumers')
    assert(consumerRenders === leafCount * (iterations + 1) && consumerCounts.every(count => count === iterations + 1), 'every context consumer renders once per provider value')
    const consumers = Array.from(state.container.querySelectorAll('[data-context-id]'))
    assert(consumers.length === leafCount && consumers.every((node, id) => node === original[id] && node.textContent === `${id}:${iterations}`), 'context consumers preserve DOM identity and receive final value')
    const staticNodes = Array.from(state.container.querySelectorAll('[data-static-id]'))
    assert(staticNodes.length === leafCount && staticNodes.every((node, id) => node.textContent === `static:${id}`), 'nonconsumer DOM is unchanged')
    return {
      durationMs, operations: iterations * leafCount, checks: 5,
      diagnostics: { outerRenders, innerRenders, staticRenders, consumerRenders },
    }
  } finally { state.cleanup() }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('Benchmark correctness failure: ' + message)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + ' did not complete in 30 seconds')), 30000)
    promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}

function host() {
  const container = document.createElement('div')
  container.dataset.runtimeBenchmark = ''
  document.body.appendChild(container)
  return container
}

function mounted(element: React.ReactNode) {
  const container = host()
  const root = createRoot(container)
  flushSync(() => root.render(element))
  return {
    container,
    root,
    cleanup() {
      flushSync(() => root.unmount())
      container.remove()
    },
  }
}

const ids = Array.from({ length: 300 }, (_, i) => i)
function Rows({ tick, reverse = false }: { tick: number; reverse?: boolean }) {
  const order = reverse ? ids.slice().reverse() : ids
  return h('ul', null, order.map(id => h('li', { key: id, 'data-id': id }, `${id}:${tick}`)))
}

function JsxRows({ tick }: { tick: number }) {
  return jsxs('ul', { children: ids.map(id => jsx('li', { 'data-id': id, children: `${id}:${tick}` }, id)) })
}

function checkRows(container: Element, tick: number, reverse = false) {
  const actual = Array.from(container.querySelectorAll('li'), node => node.textContent).join('|')
  const expected = (reverse ? ids.slice().reverse() : ids).map(id => `${id}:${tick}`).join('|')
  assert(actual === expected, 'all keyed row values and order')
}

async function renderedUpdates(
  iterations: number,
  element: (tick: number) => React.ReactNode,
  check: (container: HTMLElement, tick: number) => void,
  preserveRows = false,
) {
  let commits = 0
  function CommitProbe({ children }: { children: React.ReactNode }) {
    React.useLayoutEffect(() => { commits++ })
    return children
  }
  const view = (tick: number) => h(CommitProbe, { children: element(tick) })
  const state = mounted(view(0))
  const originalRows = preserveRows
    ? new Map(Array.from(state.container.querySelectorAll('li'), node => [node.getAttribute('data-id'), node]))
    : null
  try {
    const start = performance.now()
    for (let tick = 1; tick <= iterations; tick++) flushSync(() => state.root.render(view(tick)))
    const durationMs = performance.now() - start
    check(state.container, iterations)
    assert(commits === iterations + 1, 'every requested root update committed')
    if (originalRows) {
      const finalRows = Array.from(state.container.querySelectorAll('li'))
      assert(finalRows.length === originalRows.size && finalRows.every(node => originalRows.get(node.getAttribute('data-id')) === node), 'keyed updates preserve every row identity')
    }
    return { durationMs, operations: iterations, checks: originalRows ? 3 : 2, diagnostics: { commits } }
  } finally { state.cleanup() }
}

function Deep({ depth, tick }: { depth: number; tick: number }): React.ReactNode {
  return depth ? h('div', null, h(Deep, { depth: depth - 1, tick })) : h('span', null, tick)
}

async function setterWorkload(iterations: number, kind: 'batched' | 'sparse' | 'mixed') {
  const count = 180
  const setters: Setter[] = []
  const values = Array.from({ length: count }, () => 0)
  let renders = 0
  function Leaf({ id }: { id: number }) {
    const [value, set] = React.useState(0)
    setters[id] = set
    renders++
    return h('span', { 'data-state-id': id }, `${id}:${value}`)
  }
  function Branch({ id, depth }: { id: number; depth: number }): React.ReactNode {
    return depth ? h(Branch, { id, depth: depth - 1 }) : h(Leaf, { id })
  }
  const state = mounted(h('div', null, Array.from({ length: count }, (_, id) =>
    h(Branch, { key: id, id, depth: kind === 'mixed' ? (id % 16) * 3 : 0 }),
  )))
  const stride = kind === 'sparse' ? 18 : 1
  try {
    renders = 0
    const start = performance.now()
    for (let tick = 1; tick <= iterations; tick++) {
      flushSync(() => {
        for (let id = 0; id < count; id += stride) setters[id]!(tick)
      })
    }
    const durationMs = performance.now() - start
    for (let id = 0; id < count; id += stride) values[id] = iterations
    const actual = Array.from(state.container.querySelectorAll('[data-state-id]'), node => node.textContent).join('|')
    assert(actual === values.map((value, id) => `${id}:${value}`).join('|'), kind + ' setter final states')
    assert(renders === iterations * Math.ceil(count / stride), kind + ' setter render count')
    return { durationMs, operations: iterations * Math.ceil(count / stride), checks: 2, diagnostics: { renders } }
  } finally { state.cleanup() }
}

function Props({ tick }: { tick: number }) {
  return h('div', null, ids.map(id => h('button', {
    key: id,
    title: `${id}:${tick}`,
    'data-tick': tick,
    disabled: tick % 2 === 1,
    className: tick % 2 ? 'odd' : 'even',
    style: { color: tick % 2 ? 'red' : 'blue', paddingLeft: (tick % 7) + 'px' },
  }, String(id))))
}

function JsxProps({ tick }: { tick: number }) {
  return jsxs('div', { children: ids.map(id => jsx('button', {
    title: `${id}:${tick}`,
    'data-tick': tick,
    disabled: tick % 2 === 1,
    className: tick % 2 ? 'odd' : 'even',
    style: { color: tick % 2 ? 'red' : 'blue', paddingLeft: (tick % 7) + 'px' },
    children: String(id),
  }, id)) })
}

function checkProps(container: HTMLElement, tick: number) {
  const buttons = Array.from(container.querySelectorAll('button'))
  assert(buttons.length === ids.length && buttons.every((button, id) => button.title === `${id}:${tick}` && button.disabled === (tick % 2 === 1) && button.dataset.tick === String(tick) && button.className === (tick % 2 ? 'odd' : 'even') && button.style.color === (tick % 2 ? 'red' : 'blue') && button.style.paddingLeft === (tick % 7) + 'px'), 'all updated DOM properties')
}

function Selects({ tick }: { tick: number }) {
  return h('div', null, Array.from({ length: 30 }, (_, id) => h('select', {
    key: id,
    value: String((tick + id) % 30),
    onChange: () => {},
  }, Array.from({ length: 30 }, (_, option) => h('option', { key: option, value: String(option) }, option)))))
}

function Maybe({ id, tick }: { id: number; tick: number }) {
  return (id + tick) % 4 ? null : h('span', { 'data-visible-id': id }, `${id}:${tick}`)
}

async function passiveEffects(iterations: number) {
  const count = 100
  let creates = 0
  let cleanups = 0
  let barrier = deferred<void>()
  let finished = 0
  function Item({ tick }: { tick: number }) {
    React.useEffect(() => {
      creates++
      if (++finished === count) barrier.resolve()
      return () => { cleanups++ }
    }, [tick])
    return h('span', null, tick)
  }
  const view = (tick: number) => h('div', null, Array.from({ length: count }, (_, id) => h(Item, { key: id, tick })))
  const state = mounted(view(0))
  try {
    await withTimeout(barrier.promise, 'initial passive effects')
    creates = cleanups = 0
    let durationMs = 0
    for (let tick = 1; tick <= iterations; tick++) {
      barrier = deferred<void>()
      finished = 0
      const start = performance.now()
      flushSync(() => state.root.render(view(tick)))
      await withTimeout(barrier.promise, 'updated passive effects')
      durationMs += performance.now() - start
    }
    assert(creates === count * iterations && cleanups === count * iterations, 'every passive create and cleanup completed')
    assert(Array.from(state.container.querySelectorAll('span')).every(node => node.textContent === String(iterations)), 'passive fixture DOM committed')
    return { durationMs, operations: iterations * count, checks: 2, diagnostics: { creates, cleanups } }
  } finally { state.cleanup() }
}

async function hydration(iterations: number) {
  let durationMs = 0
  let checks = 0
  let effects = 0
  for (let tick = 1; tick <= iterations; tick++) {
    const barrier = deferred<void>()
    const errors: unknown[] = []
    function Hydrated() {
      React.useEffect(() => { effects++; barrier.resolve() }, [])
      return h(Rows, { tick })
    }
    const container = host()
    container.innerHTML = renderToString(h(Hydrated, null))
    const original = Array.from(container.querySelectorAll('li'))
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      const start = performance.now()
      root = hydrateRoot(container, h(Hydrated, null), { onRecoverableError: error => { errors.push(error) } })
      await withTimeout(barrier.promise, 'hydration effect')
      durationMs += performance.now() - start
      assert(errors.length === 0, 'hydration has no recoverable errors')
      checkRows(container, tick)
      const adopted = Array.from(container.querySelectorAll('li'))
      assert(adopted.length === original.length && adopted.every((node, i) => node === original[i]), 'hydration preserves every row DOM node')
      checks += 3
    } finally {
      if (root) flushSync(() => root!.unmount())
      container.remove()
    }
  }
  assert(effects === iterations, 'exactly one hydration passive effect per root')
  return { durationMs, operations: iterations, checks: checks + 1, diagnostics: { effects } }
}

const workloads: Workload[] = [
  ...reducerWorkloads,
  { name: 'context-through-memo', mode: 'sync', defaultIterations: 60, optIn: true, execute: contextPropagation },
  { name: 'stable-keyed-rows', mode: 'sync', defaultIterations: 100, execute: n => renderedUpdates(n, tick => h(Rows, { tick }), checkRows, true) },
  { name: 'jsx-stable-keyed-rows', mode: 'sync', defaultIterations: 100, execute: n => renderedUpdates(n, tick => jsx(JsxRows, { tick }), checkRows, true) },
  { name: 'keyed-reverse', mode: 'sync', defaultIterations: 60, execute: n => renderedUpdates(n, tick => h(Rows, { tick, reverse: tick % 2 === 1 }), (c, tick) => checkRows(c, tick, tick % 2 === 1), true) },
  {
    name: 'mount-unmount', mode: 'sync', defaultIterations: 40,
    async execute(iterations) {
      const state = mounted(null)
      let renderedCount = 0
      let mountedCount = 0
      let unmountedCount = 0
      function Marker({ tick }: { tick: number }) {
        renderedCount++
        React.useLayoutEffect(() => { mountedCount++; return () => { unmountedCount++ } }, [])
        return h(Rows, { tick })
      }
      try {
        const start = performance.now()
        for (let tick = 1; tick <= iterations; tick++) {
          flushSync(() => state.root.render(h(Marker, { tick })))
          flushSync(() => state.root.render(null))
        }
        const durationMs = performance.now() - start
        assert(state.container.childNodes.length === 0 && mountedCount === iterations && unmountedCount === iterations, 'all mount/unmount cycles completed')
        // Retain unexpected render counts when comparing historical runtimes.
        // The regression suite separately requires no render during removal.
        return { durationMs, operations: iterations, checks: 1, diagnostics: { renderedCount, mountedCount, unmountedCount } }
      } finally { state.cleanup() }
    },
  },
  { name: 'deep-tree-props', mode: 'sync', defaultIterations: 150, execute: n => renderedUpdates(n, tick => h(Deep, { depth: 70, tick }), (c, tick) => { assert(c.querySelectorAll('div').length === 70 && c.textContent === String(tick), 'deep tree final DOM') }) },
  { name: 'batched-setters', mode: 'sync', defaultIterations: 80, execute: n => setterWorkload(n, 'batched') },
  { name: 'sparse-setters', mode: 'sync', defaultIterations: 200, execute: n => setterWorkload(n, 'sparse') },
  { name: 'mixed-depth-setters', mode: 'sync', defaultIterations: 60, execute: n => setterWorkload(n, 'mixed') },
  { name: 'props-updates', mode: 'sync', defaultIterations: 100, execute: n => renderedUpdates(n, tick => h(Props, { tick }), checkProps) },
  { name: 'jsx-props-updates', mode: 'sync', defaultIterations: 100, execute: n => renderedUpdates(n, tick => jsx(JsxProps, { tick }), checkProps) },
  { name: 'passive-effects', mode: 'async', defaultIterations: 30, execute: passiveEffects },
  { name: 'controlled-selects', mode: 'sync', defaultIterations: 50, execute: n => renderedUpdates(n, tick => h(Selects, { tick }), (c, tick) => {
    const selects = Array.from(c.querySelectorAll('select'))
    assert(selects.length === 30 && selects.every((select, id) => select.value === String((tick + id) % 30) && select.options.length === 30), 'controlled select values and options')
  }) },
  { name: 'null-siblings', mode: 'sync', defaultIterations: 100, execute: n => renderedUpdates(n, tick => h('div', null, ids.map(id => h(Maybe, { key: id, id, tick }))), (c, tick) => {
    const actual = Array.from(c.querySelectorAll('[data-visible-id]'), node => node.textContent).join('|')
    assert(actual === ids.filter(id => (id + tick) % 4 === 0).map(id => `${id}:${tick}`).join('|'), 'null sibling visibility and order')
  }) },
  { name: 'hydration', mode: 'async', defaultIterations: 20, execute: hydration },
  {
    name: 'browser-ssr', mode: 'sync', defaultIterations: 100,
    async execute(iterations) {
      let html = ''
      const start = performance.now()
      for (let tick = 1; tick <= iterations; tick++) html = renderToString(h(Rows, { tick }))
      const durationMs = performance.now() - start
      const container = document.createElement('div')
      container.innerHTML = html
      checkRows(container, iterations)
      return { durationMs, operations: iterations, checks: 1, diagnostics: { outputCharacters: html.length } }
    },
  },
]

type InteractionResult = {
  factory: 'jsx'
  eventTimeStamp: number
  handlerStartMs: number
  commitMs: number
  nextFrameMs: number
  animationFrameTimestampMs: number
  handlerToCommitMs: number
  handlerToNextFrameMs: number
  finishedRows: number | null
  expectedRows: number
  checks: number
  diagnostics: { renders: number; layoutCommits: number; passiveEffects: number; handlerCalls: number }
}
let interaction: { promise: Promise<InteractionResult>; validate: () => { finishedRows: number; checks: number }; cleanup: () => void } | null = null

function cleanupInteraction() {
  interaction?.cleanup()
  interaction = null
}

async function prepareInteraction({ rows = 1000, busy = 0 }: { rows?: number; busy?: number } = {}) {
  assert(Number.isInteger(rows) && rows > 0 && rows <= 20000, 'interaction rows in range')
  assert(Number.isFinite(busy) && busy >= 0 && busy <= 100, 'interaction busy milliseconds in range')
  cleanupInteraction()
  const ready = deferred<void>()
  const updatedPassive = deferred<void>()
  const completed = deferred<InteractionResult>()
  let handlerStartMs = 0
  let eventTimeStamp = 0
  let renders = 0
  let layoutCommits = 0
  let passiveEffects = 0
  let handlerCalls = 0
  let triggered = false
  let frame = 0
  function App() {
    const [tick, setTick] = React.useState(0)
    renders++
    React.useEffect(() => {
      passiveEffects++
      if (tick) updatedPassive.resolve()
      else ready.resolve()
    }, [tick])
    React.useLayoutEffect(() => {
      layoutCommits++
      if (!tick) return
      const commitMs = performance.now()
      frame = requestAnimationFrame(animationFrameTimestampMs => {
        const nextFrameMs = performance.now()
        completed.resolve({ factory: 'jsx', eventTimeStamp, handlerStartMs, commitMs, nextFrameMs, animationFrameTimestampMs, handlerToCommitMs: commitMs - handlerStartMs, handlerToNextFrameMs: nextFrameMs - handlerStartMs, finishedRows: null, expectedRows: rows, checks: 0, diagnostics: { renders, layoutCommits, passiveEffects, handlerCalls } })
      })
    }, [tick])
    return jsxs('div', { children: [
      jsx('button', { id: 'runtime-bench-trigger', onClick: (event: { timeStamp: number }) => {
        if (triggered) return
        triggered = true
        handlerCalls++
        eventTimeStamp = event.timeStamp
        handlerStartMs = performance.now()
        // Explicit optional CPU work models an application handler, not renderer cost.
        const until = handlerStartMs + busy
        while (performance.now() < until) {}
        setTick(1)
      }, children: 'Update rows' }),
      jsx('ul', { children: Array.from({ length: rows }, (_, id) => jsx('li', { 'data-interaction-row': id, children: `${id}:${tick}` }, id)) }),
    ] })
  }
  const state = mounted(h(App, null))
  interaction = {
    promise: Promise.all([completed.promise, updatedPassive.promise]).then(([result]) => {
      assert(layoutCommits === 2 && passiveEffects === 2 && handlerCalls === 1, 'interaction commit and passive effect counts')
      return { ...result, checks: result.checks + 1, diagnostics: { renders, layoutCommits, passiveEffects, handlerCalls } }
    }),
    validate: () => {
      const nodes = Array.from(state.container.querySelectorAll('[data-interaction-row]'))
      assert(nodes.length === rows && nodes.every((node, id) => node.textContent === `${id}:1`), 'event-driven update completed every row')
      return { finishedRows: nodes.length, checks: 1 }
    },
    cleanup: () => { if (frame) cancelAnimationFrame(frame); state.cleanup() },
  }
  await withTimeout(ready.promise, 'interaction mount')
  return { selector: '#runtime-bench-trigger', rows, busy, factory: 'jsx' }
}

const api = {
  list: workloads.map(({ name, mode, defaultIterations, optIn }) => ({ name, mode, defaultIterations, ...(optIn ? { optIn } : {}) })),
  async run(name: string, iterations: number): Promise<Result> {
    const workload = workloads.find(item => item.name === name)
    assert(workload, 'unknown workload ' + name)
    assert(Number.isInteger(iterations) && iterations > 0, 'iterations must be a positive integer')
    const result = await workload.execute(iterations)
    return { name, mode: workload.mode, iterations, ...result }
  },
  prepareInteraction,
  takeInteraction() {
    assert(interaction, 'prepareInteraction must run first')
    return withTimeout(interaction.promise, 'interaction commit and next animation frame')
  },
  validateInteraction() {
    assert(interaction, 'prepareInteraction must run first')
    return interaction.validate()
  },
  cleanupInteraction,
}

;(window as Window & { __runtimeBench?: typeof api }).__runtimeBench = api

import * as React from 'react'
import { jsx } from 'react/jsx-runtime'
import { renderToString, renderToReadableStream } from 'react-dom/server'

const rowCount = 300
const ids = Array.from({ length: rowCount }, (_, id) => id)
const Scope = React.createContext('outside')
let rowRenders = 0
let hookTreeRenders = 0
let hookLeafRenders = 0
let hookCalls = 0

function payload(id: number, tick: number, escaped: boolean) {
  return escaped ? `row ${id} & <tag> "double" 'single' \u00a0 ${tick}` : `row ${id} value ${tick}`
}

function Rows({ tick, escaped = false }: { tick: number; escaped?: boolean }) {
  rowRenders++
  return jsx('ul', { 'data-fixture': escaped ? 'escaped' : 'clean', children: ids.map(id => {
    const value = payload(id, tick, escaped)
    return jsx('li', { 'data-id': id, title: value, children: value }, id)
  }) })
}

function HookLeaf({ id, tick }: { id: number; tick: number }) {
  hookLeafRenders++
  const scope = React.useContext(Scope)
  const [state] = React.useState(() => id * 2)
  const [reduced] = React.useReducer((value: number, action: number) => value + action, id + 3)
  const value = React.useMemo(() => `${scope}:${state}:${reduced}:${tick}`, [scope, state, reduced, tick])
  const identity = React.useId()
  hookCalls += 5
  return jsx('li', { 'data-id': id, 'data-scope': scope, id: identity, children: value })
}

function HookTree({ tick }: { tick: number }) {
  hookTreeRenders++
  return jsx(Scope.Provider, { value: 'outer', children: jsx('ul', { 'data-fixture': 'hooks', children:
    Array.from({ length: 6 }, (_, group) => jsx(Scope.Provider, { value: `group-${group}`, children:
      Array.from({ length: 30 }, (_, local) => {
        const id = group * 30 + local
        return jsx(HookLeaf, { id, tick }, id)
      }),
    }, group)),
  }) })
}

export const list = [
  { name: 'node-string-clean', mode: 'sync', defaultIterations: 80 },
  { name: 'node-string-escaped', mode: 'sync', defaultIterations: 80 },
  { name: 'node-string-hooks-context', mode: 'sync', defaultIterations: 60 },
  { name: 'node-readable-ready', mode: 'async', defaultIterations: 30 },
] as const

export type OutputExpectation = {
  fixture: string
  rows: Array<{ id: number; text: string; title?: string; scope?: string }>
  uniqueIds: boolean
}

function expectation(name: string, tick: number): OutputExpectation {
  if (name === 'node-string-hooks-context') {
    return {
      fixture: 'hooks',
      rows: Array.from({ length: 180 }, (_, id) => {
        const scope = `group-${Math.floor(id / 30)}`
        return { id, scope, text: `${scope}:${id * 2}:${id + 3}:${tick}` }
      }),
      uniqueIds: true,
    }
  }
  const escaped = name === 'node-string-escaped'
  return {
    fixture: escaped ? 'escaped' : 'clean',
    rows: ids.map(id => ({ id, text: payload(id, tick, escaped), title: payload(id, tick, escaped) })),
    uniqueIds: false,
  }
}

export async function run(name: string, iterations: number) {
  if (!list.some(work => work.name === name)) throw new Error('Unknown SSR workload: ' + name)
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('SSR iterations must be a positive integer')
  let html = ''
  let totalCharacters = 0
  let totalChunks = 0
  let streamErrors = 0
  rowRenders = hookTreeRenders = hookLeafRenders = hookCalls = 0
  const start = performance.now()
  for (let tick = 1; tick <= iterations; tick++) {
    const element = name === 'node-string-hooks-context'
      ? jsx(HookTree, { tick })
      : jsx(Rows, { tick, escaped: name === 'node-string-escaped' })
    if (name === 'node-readable-ready') {
      const stream = await renderToReadableStream(element, { onError: () => { streamErrors++ } })
      await stream.allReady
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      html = ''
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          html += decoder.decode(chunk.value, { stream: true })
          totalChunks++
        }
        html += decoder.decode()
      } finally { reader.releaseLock() }
    } else {
      html = renderToString(element)
    }
    totalCharacters += html.length
  }
  const durationMs = performance.now() - start
  if (streamErrors) throw new Error('Readable stream reported ' + streamErrors + ' errors')
  if (name === 'node-string-hooks-context') {
    if (hookTreeRenders !== iterations || hookLeafRenders !== iterations * 180 || hookCalls !== iterations * 180 * 5) throw new Error('SSR hook/component render count mismatch')
  } else if (rowRenders !== iterations) throw new Error('SSR row component render count mismatch')
  return {
    name,
    iterations,
    durationMs,
    operations: iterations,
    factory: 'jsx',
    html,
    expected: expectation(name, iterations),
    diagnostics: { totalCharacters, totalChunks, streamErrors, rowRenders, hookTreeRenders, hookLeafRenders, hookCalls },
  }
}

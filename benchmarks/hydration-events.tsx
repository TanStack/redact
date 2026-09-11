import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

type Mode = 'static' | 'event-heavy'
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('Hydration benchmark: ' + message)
}

async function run(mode: Mode, iterations: number, rows: number) {
  assert(mode === 'static' || mode === 'event-heavy', 'unknown mode')
  assert(Number.isInteger(iterations) && iterations > 0 && Number.isInteger(rows) && rows > 0, 'invalid work count')
  let durationMs = 0, renders = 0, commits = 0, callbacks = 0, checks = 0
  for (let iteration = 0; iteration < iterations; iteration++) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const errors: unknown[] = []
    const calls: string[] = []
    let rendered = 0, committed = 0
    let finish!: () => void
    let reject!: (error: unknown) => void
    const done = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail })
    function View() {
      rendered++
      React.useEffect(() => { committed++; finish() }, [])
      return <main>{Array.from({ length: rows }, (_, id) => <button
        key={id} type="button" data-id={id} data-iteration={iteration}
        onClick={mode === 'event-heavy' ? () => calls.push(`${id}:click`) : undefined}
        onClickCapture={mode === 'event-heavy' ? () => calls.push(`${id}:click-capture`) : undefined}
        onMouseDown={mode === 'event-heavy' ? () => calls.push(`${id}:down`) : undefined}
        onMouseDownCapture={mode === 'event-heavy' ? () => calls.push(`${id}:down-capture`) : undefined}
      >row:{id}:{iteration}</button>)}</main>
    }
    let root: ReturnType<typeof hydrateRoot> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      container.innerHTML = renderToString(<View />)
      const original = Array.from(container.querySelectorAll('button'))
      const originalMain = container.firstChild
      rendered = 0
      timer = setTimeout(() => reject(new Error('Hydration effect timed out')), 30000)
      const start = performance.now()
      root = hydrateRoot(container, <View />, {
        onRecoverableError(error: unknown) { errors.push(error) },
        onUncaughtError(error: unknown) { errors.push(error); reject(error) },
      })
      await done
      durationMs += performance.now() - start
      clearTimeout(timer)

      // Identity, output, lifecycle and callback checks are outside the timer.
      const adopted = Array.from(container.querySelectorAll('button'))
      assert(errors.length === 0, 'unexpected hydration error')
      assert(rendered === 1 && committed === 1, 'one render and passive-effect commit per root')
      assert(container.firstChild === originalMain && adopted.length === rows && adopted.every((node, id) => node === original[id]), 'every server host is adopted')
      assert(adopted.every((node, id) => node.textContent === `row:${id}:${iteration}` && node.dataset.id === String(id) && node.dataset.iteration === String(iteration)), 'all row output matches')
      checks += 4
      for (const [id, node] of adopted.entries()) {
        node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        const expected = mode === 'event-heavy' ? [`${id}:down-capture`, `${id}:down`, `${id}:click-capture`, `${id}:click`] : []
        assert(calls.length === expected.length && calls.every((value, index) => value === expected[index]), 'each callback runs once in capture/bubble order')
        callbacks += calls.length
        calls.length = 0
        checks++
      }
      renders += rendered
      commits += committed
    } finally {
      clearTimeout(timer)
      if (root) flushSync(() => root!.unmount())
      const empty = container.childNodes.length === 0
      container.remove()
      if (root) assert(empty, 'unmount removes all owned DOM')
    }
    checks++
  }
  return { mode, iterations, rows, durationMs, operations: iterations * rows, checks, renders, commits, callbacks }
}

declare global {
  interface Window { __hydrationEvents: { run: typeof run } }
}
window.__hydrationEvents = { run }

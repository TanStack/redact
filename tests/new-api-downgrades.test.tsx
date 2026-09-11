import { expect, it, vi } from 'vitest'
import { ViewTransition, addTransitionType, startTransition, useState, useTransition } from '@tanstack/redact'
import { createRoot } from '@tanstack/redact/dom-client'
import { flushSync } from '@tanstack/redact/dom'
import { renderToString } from '@tanstack/redact/server'

it('renders ViewTransition server children without animation metadata', () => {
  const animate = vi.fn()
  const output = renderToString(<ViewTransition name="sync" enter="enter" onEnter={animate}><b>server</b></ViewTransition>)
  expect(output).toBe('<b>server</b>')
  expect(animate).not.toHaveBeenCalled()
})

it('keeps exported and hook transitions synchronous without animation callbacks', () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  const animate = vi.fn()
  const sequence: string[] = []
  let update!: (n: number) => void
  let transition!: (fn: () => void) => void
  function App() {
    const [value, set] = useState(0)
    const [pending, start] = useTransition()
    expect(pending).toBe(false)
    update = set
    transition = start
    return <ViewTransition name="sync" onEnter={animate} onUpdate={animate} onExit={animate}><b>{value}</b></ViewTransition>
  }
  try {
    flushSync(() => root.render(<App />))
    for (const start of [startTransition, transition]) {
      sequence.length = 0
      flushSync(() => {
        start(() => { sequence.push('inside'); addTransitionType('next'); update(2) })
        sequence.push('after')
      })
      expect(sequence).toEqual(['inside', 'after'])
      expect(container.textContent).toBe('2')
    }
    flushSync(() => root.render(null))
    expect(animate).not.toHaveBeenCalled()
  } finally { root.unmount() }
})

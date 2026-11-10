import { expect, it, vi } from 'vitest'
import { act, useEffect, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

it('flushes focus work scheduled before an event inside act', () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  function App() {
    const [focused, setFocused] = useState(false)
    const [open, setOpen] = useState(true)
    return <button data-focused={String(focused)} onFocus={() => setFocused(true)} onClick={() => setOpen(value => !value)}>{open ? 'open' : 'closed'}</button>
  }
  try {
    act(() => root.render(<App />))
    const button = container.querySelector('button')!
    button.focus()
    act(() => button.click())
    expect(button.dataset.focused).toBe('true')
    expect(button.textContent).toBe('closed')
  } finally { act(() => root.unmount()); container.remove() }
})

it('flushes previously queued roots once and leaves the old microtask harmless', async () => {
  const roots = [createRoot(document.createElement('div')), createRoot(document.createElement('div'))]
  const updates: Array<(value: number) => void> = []
  const effects = vi.fn()
  function App({ index }: { index: number }) {
    const [value, set] = useState(0)
    updates[index] = set
    useEffect(() => { effects(index, value) }, [value])
    return null
  }
  try {
    act(() => roots.forEach((root, index) => root.render(<App index={index} />)))
    effects.mockClear()
    updates[0]!(1); updates[1]!(2)
    act(() => { updates[0]!(2); updates[1]!(3) })
    expect(effects.mock.calls).toEqual([[0, 2], [1, 3]])
    await Promise.resolve()
    expect(effects.mock.calls).toEqual([[0, 2], [1, 3]])
  } finally { act(() => roots.forEach(root => root.unmount())) }
})

it('leaves prequeued work asynchronous when act schedules no new update', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  let update!: (value: number) => void
  function App() { const [value, set] = useState(0); update = set; return <span>{value}</span> }
  try {
    act(() => root.render(<App />))
    update(1)
    act(() => {})
    expect(container.textContent).toBe('0')
    await act(async () => { await Promise.resolve() })
    expect(container.textContent).toBe('1')
  } finally { act(() => root.unmount()) }
})
it('does not let an old host callback split a later microtask batch after act drains it', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  const commits: number[] = []
  let update!: (value: number) => void
  function App() {
    const [value, set] = useState(0)
    update = set
    useLayoutEffect(() => { commits.push(value) }, [value])
    return <span>{value}</span>
  }
  try {
    act(() => root.render(<App />))
    update(1)
    act(() => update(2))
    expect(container.textContent).toBe('2')
    commits.length = 0
    queueMicrotask(() => update(4))
    update(3)
    await Promise.resolve()
    expect(container.textContent).toBe('4')
    expect(commits).toEqual([4])
  } finally {
    act(() => root.unmount())
  }
})

it('lets an existing host callback recover queued work when act throws', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  let update!: (value: number) => void
  function App() {
    const [value, set] = useState(0)
    update = set
    return <span>{value}</span>
  }
  try {
    act(() => root.render(<App />))
    update(1)
    expect(() => act(() => { update(2); throw new Error('callback failed') })).toThrow('callback failed')
    await Promise.resolve()
    expect(container.textContent).toBe('2')
    update(3)
    await Promise.resolve()
    expect(container.textContent).toBe('3')
  } finally { act(() => root.unmount()) }
})

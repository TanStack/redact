import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function setup() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, root, render: (node: React.ReactNode) => flushSync(() => root.render(node)) }
}

it('does not render a pending child update after root.render removes that child', () => {
  const { container, root, render } = setup()
  let set!: (value: boolean) => void
  let renders = 0
  function Child() {
    const [changed, update] = React.useState(false)
    set = update
    renders++
    return changed ? <i>new</i> : <b>old</b>
  }
  render(<Child />)
  flushSync(() => { set(true); root.render(null) })
  expect(container.childNodes.length).toBe(0)
  expect(renders).toBe(1)
})

it('does not render a pending grandchild when an ancestor state update removes its subtree', () => {
  const { container, render } = setup()
  let hide!: () => void
  let set!: (value: boolean) => void
  let renders = 0
  function Child() {
    const [changed, update] = React.useState(false)
    set = update
    renders++
    return changed ? <i>new</i> : <b>old</b>
  }
  function Parent() {
    const [visible, update] = React.useState(true)
    hide = () => update(false)
    return visible ? <section><Child /></section> : <p>removed</p>
  }
  render(<Parent />)
  flushSync(() => { set(true); hide() })
  expect(container.innerHTML).toBe('<p>removed</p>')
  expect(renders).toBe(1)
})

it('restores a planned deletion when Suspense abandons the primary attempt', async () => {
  const { container, render } = setup()
  let set!: (value: number) => void
  let resolve!: () => void
  let ready = false
  const pending = new Promise<void>(done => { resolve = done })
  function Child() {
    const [value, update] = React.useState(0)
    set = update
    return <b>{value}</b>
  }
  function Pending({ suspend }: { suspend: boolean; key?: string }) {
    if (suspend && !ready) throw pending
    return <span>ready</span>
  }
  const tree = (keep: boolean, suspend: boolean) => <React.Suspense fallback={<i>fallback</i>}>
    <section>{keep ? <Child key="child" /> : null}<Pending key="pending" suspend={suspend} /></section>
  </React.Suspense>
  render(tree(true, false))
  const child = container.querySelector('b')!
  render(tree(false, true))
  expect(child.isConnected).toBe(true)
  expect(container.querySelector('i')).not.toBeNull()
  ready = true
  resolve()
  await Promise.resolve()
  flushSync(() => { set(1); render(tree(true, false)) })
  await vi.waitFor(() => expect(container.querySelector('i')).toBeNull())
  expect(container.querySelector('b')).toBe(child)
  expect(child.textContent).toBe('1')
})

for (const wrapper of ['memo', 'lazy'] as const) {
  it(`rolls back ${wrapper}-wrapped class state after a later sibling suspends`, async () => {
    const { container, render } = setup()
    let resolve!: () => void
    let ready = false
    const pending = new Promise<void>(done => { resolve = done })
    class Counter extends React.Component<{ value: number }, { renders: number }> {
      state = { renders: 0 }
      static getDerivedStateFromProps(_props: { value: number }, state: { renders: number }) {
        return { renders: state.renders + 1 }
      }
      render() { return <b>{this.props.value}:{this.state.renders}</b> }
    }
    const lazy = React.lazy(() => Promise.resolve({ default: Counter }))
    const Wrapped: any = wrapper === 'memo' ? React.memo(Counter as any) : lazy
    function Pending({ suspend }: { suspend: boolean }) {
      if (suspend && !ready) throw pending
      return <span>ready</span>
    }
    const tree = (value: number, suspend: boolean) => <React.Suspense fallback={<i>fallback</i>}>
      <section><Wrapped value={value} /><Pending suspend={suspend} /></section>
    </React.Suspense>
    render(tree(0, false))
    await vi.waitFor(() => expect(container.querySelector('b')).not.toBeNull())
    const child = container.querySelector('b')!
    const initial = Number(child.textContent!.split(':')[1])
    render(tree(1, true))
    expect(child.textContent).toBe(`0:${initial}`)
    ready = true
    resolve()
    await vi.waitFor(() => expect(container.querySelector('i')).toBeNull())
    expect(container.querySelector('b')).toBe(child)
    expect(child.textContent).toBe(`1:${initial + 1}`)
  })
}

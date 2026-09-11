import { afterEach, expect, it } from 'vitest'
import { createElement, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function setup() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: any) => flushSync(() => root.render(node)) }
}

it('renders the entire next tree before changing live sibling DOM', () => {
  const { container, render } = setup()
  const observed: string[] = []
  function Reader({ value }: { value: number }) {
    observed.push(container.textContent || '')
    return <span>{value}</span>
  }
  const tree = (value: number) => <><div>{value}</div><Reader value={value} /></>
  render(tree(0))
  observed.length = 0
  render(tree(1))
  expect(observed).toEqual(['00'])
  expect(container.textContent).toBe('11')
})

it('keeps removed refs and DOM intact until all next components have rendered', () => {
  const { container, render } = setup()
  const ref = { current: null as HTMLDivElement | null }
  const observed: unknown[] = []
  function Reader() {
    observed.push(ref.current?.textContent, container.textContent)
    return <span>next</span>
  }
  render(<div ref={ref}>old</div>)
  render(<Reader />)
  expect(observed).toEqual(['old', 'old'])
  expect(ref.current).toBeNull()
  expect(container.textContent).toBe('next')
})

it('does not rerun components to commit prepared host updates', () => {
  const { container, render } = setup()
  let set!: (value: number) => void
  let renders = 0
  const committed: string[] = []
  function App() {
    const [value, update] = useState(0)
    set = update
    renders++
    useLayoutEffect(() => { committed.push(container.textContent || '') })
    return <><div>{value}</div><input value={String(value)} readOnly /></>
  }
  render(createElement(App, null))
  flushSync(() => set(1))
  expect(renders).toBe(2)
  expect(committed).toEqual(['0', '1'])
  expect(container.querySelector('input')?.value).toBe('1')
})

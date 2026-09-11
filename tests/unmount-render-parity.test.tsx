import { afterEach, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: React.ReactNode) => flushSync(() => root.render(node)) }
}

for (const nested of [false, true]) {
  const location = nested ? 'nested children' : 'root children'

  it(`does not rerender function components when removing ${location}`, () => {
    let renders = 0
    let effectCreates = 0
    let effectCleanups = 0
    function Child() {
      renders++
      React.useLayoutEffect(() => {
        effectCreates++
        return () => { effectCleanups++ }
      })
      return <span>child</span>
    }
    const { container, render } = setup()
    const view = (visible: boolean) => nested ? <section>{visible ? <Child /> : null}</section> : visible ? <Child /> : null
    render(view(true))
    expect([renders, effectCreates, effectCleanups]).toEqual([1, 1, 0])
    render(view(false))
    expect([renders, effectCreates, effectCleanups]).toEqual([1, 1, 1])
    expect(container.textContent).toBe('')
    expect(container.querySelectorAll('section').length).toBe(nested ? 1 : 0)
  })

  it(`does not rerender class components when removing ${location}`, () => {
    let renders = 0
    let mounts = 0
    let updates = 0
    let unmounts = 0
    class Child extends React.Component {
      componentDidMount() { mounts++ }
      componentDidUpdate() { updates++ }
      componentWillUnmount() { unmounts++ }
      render() { renders++; return <span>child</span> }
    }
    const { container, render } = setup()
    const view = (visible: boolean) => nested ? <section>{visible ? <Child /> : null}</section> : visible ? <Child /> : null
    render(view(true))
    expect([renders, mounts, updates, unmounts]).toEqual([1, 1, 0, 0])
    render(view(false))
    expect([renders, mounts, updates, unmounts]).toEqual([1, 1, 0, 1])
    expect(container.textContent).toBe('')
  })

  it(`does not mount new descendants or run their effects while removing ${location}`, () => {
    let removed = false
    let childRenders = 0
    let unexpectedRenders = 0
    let unexpectedEffects = 0
    let unexpectedRefs = 0
    function Unexpected() {
      unexpectedRenders++
      React.useLayoutEffect(() => { unexpectedEffects++ }, [])
      return <i ref={() => { unexpectedRefs++ }}>unexpected</i>
    }
    function Child() {
      childRenders++
      return removed ? <Unexpected /> : <span>original</span>
    }
    const { container, render } = setup()
    render(nested ? <section><Child /></section> : <Child />)
    removed = true
    render(nested ? <section /> : null)
    expect([childRenders, unexpectedRenders, unexpectedEffects, unexpectedRefs]).toEqual([1, 0, 0, 0])
    expect(container.textContent).toBe('')
  })
}

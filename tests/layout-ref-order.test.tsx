import { afterEach, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container, { onCaughtError: () => {} })
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return (node: React.ReactNode) => flushSync(() => root.render(node))
}

for (const objectRefs of [false, true]) {
  it(`commits sibling subtrees in order with ${objectRefs ? 'object' : 'callback'} refs`, () => {
    const render = setup()
    const log: string[] = []
    const second = React.createRef<HTMLElement>()
    function First() {
      React.useLayoutEffect(() => { log.push('first-layout:' + (second.current === null)) }, [])
      return <span ref={() => { log.push('first-ref') }} />
    }
    function Second() {
      React.useLayoutEffect(() => { log.push('second-layout:' + !!second.current) }, [])
      return <b ref={objectRefs ? second : (node: HTMLElement | null) => { second.current = node; log.push('second-ref') }} />
    }
    function Parent() {
      React.useLayoutEffect(() => { log.push('parent-layout:' + !!second.current) }, [])
      return <><First /><Second /></>
    }
    render(<Parent />)
    expect(log).toEqual(objectRefs
      ? ['first-ref', 'first-layout:true', 'second-layout:true', 'parent-layout:true']
      : ['first-ref', 'first-layout:true', 'second-ref', 'second-layout:true', 'parent-layout:true'])
  })
}

it('commits descendant refs and layout before ancestor refs and layout', () => {
  const render = setup()
  const log: string[] = []
  function Child() {
    React.useLayoutEffect(() => { log.push('child-layout') }, [])
    return <b ref={() => { log.push('child-ref') }} />
  }
  function Parent() {
    React.useLayoutEffect(() => { log.push('parent-layout') }, [])
    return <div ref={() => { log.push('parent-ref') }}><Child /></div>
  }
  render(<Parent />)
  expect(log).toEqual(['child-ref', 'child-layout', 'parent-ref', 'parent-layout'])
})

it('attaches a class ref after its mount lifecycle and before parent layout', () => {
  const render = setup()
  const log: string[] = []
  class Child extends React.Component<{ ref?: React.Ref<Child> }> {
    componentDidMount() { log.push('class-mount') }
    render() { return <b ref={() => { log.push('host-ref') }} /> }
  }
  function Parent() {
    React.useLayoutEffect(() => { log.push('parent-layout') }, [])
    return <Child ref={() => { log.push('class-ref') }} />
  }
  render(<Parent />)
  expect(log).toEqual(['host-ref', 'class-mount', 'class-ref', 'parent-layout'])
})

it('attaches fragment refs before their descendant refs and layout effects', () => {
  const render = setup()
  const log: string[] = []
  function Child() {
    React.useLayoutEffect(() => { log.push('child-layout') }, [])
    return <b ref={() => { log.push('host-ref') }} />
  }
  function Parent() {
    React.useLayoutEffect(() => { log.push('parent-layout') }, [])
    return <React.Fragment ref={() => { log.push('fragment-ref') }}><Child /></React.Fragment>
  }
  render(<Parent />)
  expect(log).toEqual(['fragment-ref', 'host-ref', 'child-layout', 'parent-layout'])
})

it('reconnects Activity refs, layout effects and class lifecycles in subtree order', async () => {
  const render = setup()
  const log: string[] = []
  function First() {
    React.useLayoutEffect(() => { log.push('first-layout') }, [])
    return <span ref={() => { log.push('first-ref') }} />
  }
  class Second extends React.Component<{ ref?: React.Ref<Second> }> {
    componentDidMount() { log.push('class-mount') }
    render() { return <b ref={() => { log.push('second-ref') }} /> }
  }
  function Parent() {
    React.useLayoutEffect(() => { log.push('parent-layout') }, [])
    return <React.Fragment ref={() => { log.push('fragment-ref') }}><First /><Second ref={() => { log.push('class-ref') }} /></React.Fragment>
  }
  const view = (mode: 'visible' | 'hidden') => <React.Activity mode={mode}><Parent /></React.Activity>
  render(view('visible'))
  render(view('hidden'))
  await new Promise(resolve => setTimeout(resolve, 30))
  log.length = 0
  render(view('visible'))
  expect(log).toEqual(['fragment-ref', 'first-ref', 'first-layout', 'second-ref', 'class-mount', 'class-ref', 'parent-layout'])
})

it('runs insertion effects before attaching refs or running layout effects', () => {
  const render = setup()
  const log: string[] = []
  function Child() {
    React.useLayoutEffect(() => { log.push('layout') }, [])
    React.useInsertionEffect(() => { log.push('insertion') }, [])
    return <span ref={() => { log.push('ref') }} />
  }
  render(<Child />)
  expect(log).toEqual(['insertion', 'ref', 'layout'])
})

it('installs ancestor insertion effects before child callback refs', () => {
  const render = setup()
  let installed = false
  const log: boolean[] = []
  function Child() { return <b ref={() => { log.push(installed) }} /> }
  function Parent() {
    React.useInsertionEffect(() => { installed = true }, [])
    return <Child />
  }
  render(<Parent />)
  expect(log).toEqual([true])
})

it('assigns object refs after placement, so user DOM moves are not immediately overwritten', () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  const ref = {
    get current(): HTMLElement | null { return null },
    set current(node: HTMLElement | null) { if (node) container.appendChild(node) },
  }
  try {
    flushSync(() => root.render(<><span ref={ref}>item</span><b>tail</b></>))
    expect(container.textContent).toBe('tailitem')
  } finally { flushSync(() => root.unmount()) }
})

it('discards a throwing subtree layout effect and preserves later sibling ordering', () => {
  const render = setup()
  const log: string[] = []
  function Bad() {
    React.useLayoutEffect(() => { log.push('abandoned-layout') }, [])
    throw new Error('expected render failure')
  }
  class Boundary extends React.Component<{ children?: React.ReactNode }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    render() { return this.state.failed ? <i>fallback</i> : this.props.children }
  }
  function Good() {
    React.useLayoutEffect(() => { log.push('good-layout') }, [])
    return <b ref={() => { log.push('good-ref') }} />
  }
  render(<><Boundary><Bad /></Boundary><Good /></>)
  expect(log).toEqual(['good-ref', 'good-layout'])
})

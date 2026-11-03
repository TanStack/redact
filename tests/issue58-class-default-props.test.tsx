import { afterEach, expect, it } from 'vitest'
import { Component, createElement } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { jsxDEV } from 'react/jsx-dev-runtime'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

it.each([jsx, jsxs, jsxDEV])('resolves class defaults without changing frozen JSX props', factory => {
  const seen: Array<string | null | undefined> = []
  class Greeting extends Component<{ name?: string | null }> {
    static defaultProps = { name: 'world' }
    constructor(props: any) { super(props); seen.push(props.name) }
    static getDerivedStateFromProps(props: any) { seen.push(props.name); return null }
    render() { seen.push(this.props.name); return createElement('p', null, String(this.props.name)) }
  }
  const props = Object.freeze({ name: undefined })
  const element = factory(Greeting, props)
  const container = document.createElement('div')
  const root = createRoot(container)
  cleanups.push(() => flushSync(() => root.unmount()))
  flushSync(() => root.render(element))
  expect(container.textContent).toBe('world')
  expect(seen.every(value => value === 'world')).toBe(true)
  expect(props.name).toBeUndefined()
  flushSync(() => root.render(factory(Greeting, { name: null })))
  expect(container.textContent).toBe('null')
  flushSync(() => root.render(factory(Greeting, { name: 'custom' })))
  expect(container.textContent).toBe('custom')
  flushSync(() => root.render(factory(Greeting, props)))
  expect(container.textContent).toBe('world')
  expect(renderToString(element)).toContain('world')
})

it('does not add function defaults to automatic-runtime props', () => {
  function Greeting(props: any) { return createElement('p', null, String(props.name)) }
  Greeting.defaultProps = { name: 'world' }
  expect(renderToString(jsx(Greeting, {}))).toContain('undefined')
})

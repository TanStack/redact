import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
const onChange = () => {}

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => {
    flushSync(() => root.unmount())
    container.remove()
  })
  return {
    container,
    render(children: React.ReactNode) {
      flushSync(() => root.render(children))
    },
  }
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

describe('React 19.3 upstream regression parity', () => {
  // https://github.com/react/react/pull/36160
  it('context changes reach a visible fallback behind a memo boundary', () => {
    const { render, container } = setup()
    const Context = React.createContext('initial')
    const pending = new Promise<void>(() => {})
    function Pending() { throw pending }
    function Fallback() { return <span>{React.useContext(Context)}</span> }
    const Boundary = React.memo(() => (
      <React.Suspense fallback={<Fallback />}><Pending /></React.Suspense>
    ))
    render(<Context.Provider value="first"><Boundary /></Context.Provider>)
    expect(container.textContent).toBe('first')
    render(<Context.Provider value="second"><Boundary /></Context.Provider>)
    expect(container.textContent).toBe('second')
  })

  // https://github.com/react/react/pull/35839
  it('context unblocks Suspense without resolving its old promise', () => {
    const { render, container } = setup()
    const Context = React.createContext(false)
    const pending = new Promise<void>(() => {})
    function Content() {
      if (!React.useContext(Context)) throw pending
      return <span>ready</span>
    }
    const tree = (ready: boolean) => (
      <Context.Provider value={ready}>
        <React.Suspense fallback={<i>loading</i>}><Content /></React.Suspense>
      </Context.Provider>
    )
    render(tree(false))
    expect(container.textContent).toBe('loading')
    render(tree(true))
    expect(container.textContent).toBe('ready')
  })

  // https://github.com/react/react/pull/36980
  it('syncs a focused controlled number input defaultValue before blur', () => {
    const { render, container } = setup()
    render(<input type="number" value="1" onChange={onChange} />)
    const input = container.firstChild as HTMLInputElement
    input.focus()
    render(<input type="number" value="2" onChange={onChange} />)
    expect(input.value).toBe('2')
    expect(input.defaultValue).toBe('2')
  })

  it('preserves and mirrors equivalent numeric spellings', () => {
    const { render, container } = setup()
    render(<input type="number" value="0.0" onChange={onChange} />)
    const input = container.firstChild as HTMLInputElement
    render(<input type="number" value={0} onChange={onChange} />)
    expect(input.value).toBe('0.0')
    expect(input.defaultValue).toBe('0.0')
  })
})

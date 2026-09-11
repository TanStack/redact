import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

const cleanups: Array<() => void> = []
function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => {
    flushSync(() => root.unmount())
    container.remove()
  })
  return { container, render: (node: React.ReactNode) => flushSync(() => root.render(node)) }
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

describe('context rendered as its own provider', () => {
  it('provides a value to descendants', () => {
    const { render, container } = setup()
    const Ctx = React.createContext('default')
    const Read = () => <span>{React.useContext(Ctx)}</span>
    render(
      <Ctx value="provided">
        <Read />
      </Ctx>,
    )
    expect(container.textContent).toBe('provided')
  })

  it('propagates updates and interops with the Provider form', () => {
    const { render, container } = setup()
    const Ctx = React.createContext('default')
    const Read = React.memo(() => <span>{React.useContext(Ctx)}</span>)
    render(
      <Ctx value="first">
        <Read />
      </Ctx>,
    )
    render(
      <Ctx value="second">
        <Read />
      </Ctx>,
    )
    expect(container.textContent).toBe('second')
    render(
      <Ctx value="outer">
        <Ctx.Provider value="inner">
          <Read />
        </Ctx.Provider>
      </Ctx>,
    )
    expect(container.textContent).toBe('inner')
  })

  it('reads through a Consumer', () => {
    const { render, container } = setup()
    const Ctx = React.createContext('default')
    render(
      <Ctx value="consumed">
        <Ctx.Consumer>{(value) => <span>{value}</span>}</Ctx.Consumer>
      </Ctx>,
    )
    expect(container.textContent).toBe('consumed')
  })

  it('provides the value on the server', () => {
    const Ctx = React.createContext('default')
    const Read = () => <span>{React.useContext(Ctx)}</span>
    expect(
      renderToString(
        <Ctx value="ssr">
          <Read />
        </Ctx>,
      ),
    ).toContain('ssr')
  })
})

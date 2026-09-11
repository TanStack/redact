import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString, renderToReadableStream } from 'react-dom/server'

describe('hooks across client and server rendering', () => {
  it('does not restore a finished client render when a stream completes', async () => {
    let pending: ReturnType<typeof renderToReadableStream>
    function App() {
      pending = renderToReadableStream(<span>server</span>)
      return <div>client</div>
    }
    const root = createRoot(document.createElement('div'))
    root.render(<App />)
    const stream = await pending!
    await stream.allReady
    expect(() => React.useState(0)).toThrow()
    root.unmount()
  })

  it('restores server IDs and context after a nested server render', () => {
    const Context = React.createContext('default')
    function Inner() {
      return <i>{`${React.useContext(Context)}:${React.useId()}`}</i>
    }
    function Outer() {
      const first = React.useId()
      expect(renderToString(<Context.Provider value="inner"><Inner /></Context.Provider>, {
        identifierPrefix: 'inner',
      })).toBe('<i>inner:inner0</i>')
      const second = React.useId()
      return <span>{`${React.useContext(Context)}:${first}:${second}`}</span>
    }
    expect(renderToString(<Context.Provider value="outer"><Outer /></Context.Provider>, {
      identifierPrefix: 'outer',
    })).toBe('<span>outer:outer0:outer1</span>')
    expect(Context._currentValue).toBe('default')
  })

  it('restores client hooks after nested server rendering, including errors', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const effect = vi.fn()
    function Server({ fail = false }) {
      const [value] = React.useState('server')
      React.useLayoutEffect(effect, [])
      if (fail) throw new Error('server failure')
      return <i>{value}</i>
    }
    function App() {
      const [before, setBefore] = React.useState(1)
      expect(renderToString(<Server />)).toBe('<i>server</i>')
      expect(() => renderToString(<Server fail />)).toThrow('server failure')
      const [after, setAfter] = React.useState(10)
      return <button onClick={() => { setBefore(before + 1); setAfter(after + 10) }}>
        {before}:{after}
      </button>
    }
    root.render(<App />)
    expect(container.textContent).toBe('1:10')
    flushSync(() => container.querySelector('button')!.click())
    expect(container.textContent).toBe('2:20')
    expect(effect).not.toHaveBeenCalled()
    root.unmount()
    expect(() => React.useState(0)).toThrow()
  })

  it('uses server snapshots when the server renderer is dynamically imported', async () => {
    const { renderToString: render } = await import('react-dom/server')
    const subscribe = vi.fn(() => () => {})
    function App() {
      const value = React.useSyncExternalStore(subscribe, () => 'client', () => 'server')
      return <span>{value}</span>
    }
    expect(render(<App />)).toBe('<span>server</span>')
    expect(subscribe).not.toHaveBeenCalled()
    const container = document.createElement('div')
    const root = createRoot(container)
    root.render(<App />)
    expect(container.textContent).toBe('client')
    root.unmount()
  })

  it('unmounts a removed keyed class exactly once', () => {
    const unmount = vi.fn()
    class Child extends React.Component<{ id: string; key?: string }> {
      componentWillUnmount() { unmount(this.props.id) }
      render() { return <span>{this.props.id}</span> }
    }
    const container = document.createElement('div')
    const root = createRoot(container)
    root.render(<div><Child key="a" id="a" /><Child key="b" id="b" /></div>)
    root.render(<div><Child key="b" id="b" /></div>)
    expect(unmount.mock.calls).toEqual([['a']])
    expect(container.textContent).toBe('b')
    root.unmount()
    expect(unmount.mock.calls).toEqual([['a'], ['b']])
  })
})

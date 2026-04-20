import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

describe('basic render', () => {
  it('renders a single element', () => {
    const container = setup()
    const root = createRoot(container)
    root.render(<div id="x">hello</div>)
    expect(container.innerHTML).toBe('<div id="x">hello</div>')
  })

  it('renders a function component', () => {
    const container = setup()
    function App() {
      return <span class="greeting">hi</span>
    }
    createRoot(container).render(<App />)
    expect(container.innerHTML).toBe('<span class="greeting">hi</span>')
  })

  it('useState updates on event', () => {
    const container = setup()
    function Counter() {
      const [n, setN] = React.useState(0)
      return (
        <button id="b" onClick={() => setN(n + 1)}>
          {n}
        </button>
      )
    }
    const root = createRoot(container)
    root.render(<Counter />)
    const btn = container.querySelector('#b') as HTMLButtonElement
    expect(btn.textContent).toBe('0')
    flushSync(() => btn.click())
    expect(btn.textContent).toBe('1')
    flushSync(() => btn.click())
    expect(btn.textContent).toBe('2')
  })

  it('renders Fragment and arrays', () => {
    const container = setup()
    function App() {
      return (
        <>
          <span>a</span>
          <span>b</span>
          {[<span key="c">c</span>, <span key="d">d</span>]}
        </>
      )
    }
    createRoot(container).render(<App />)
    expect(container.innerHTML).toBe('<span>a</span><span>b</span><span>c</span><span>d</span>')
  })

  it('class component with setState', () => {
    const container = setup()
    class Counter extends React.Component<{}, { n: number }> {
      state = { n: 0 }
      render() {
        return (
          <button id="cb" onClick={() => this.setState({ n: this.state.n + 1 })}>
            {this.state.n}
          </button>
        )
      }
    }
    createRoot(container).render(<Counter />)
    const btn = container.querySelector('#cb') as HTMLButtonElement
    expect(btn.textContent).toBe('0')
    flushSync(() => btn.click())
    expect(btn.textContent).toBe('1')
  })

  it('context propagates', () => {
    const container = setup()
    const Ctx = React.createContext('default')
    function Child() {
      return <span>{React.useContext(Ctx)}</span>
    }
    function App() {
      return (
        <Ctx.Provider value="hello">
          <Child />
        </Ctx.Provider>
      )
    }
    createRoot(container).render(<App />)
    expect(container.innerHTML).toBe('<span>hello</span>')
  })

  // Regression: with unkeyed children, a leading sibling flipping null → element
  // (e.g. `showMenu` revealing a smallMenu above a stable largeMenu wrapped in
  // a Fragment) used to trigger positional matching that stole a later same-
  // type fiber's DOM and tore the drawer, which interrupted CSS transitions
  // and caused a pop-in rather than a slide. The fix: budget-guided positional
  // matching so insertions don't cascade.
  //
  // This mirrors the actual Navbar layout where largeMenu is `<>...</>`
  // wrapping the drawer div.
  it('preserves fragment-wrapped sibling when prepending a new sibling', () => {
    const container = setup()
    let toggle!: () => void
    function App() {
      const [show, setShow] = React.useState(false)
      toggle = () => setShow((s) => !s)
      return (
        <div>
          {show ? <div id="pop" /> : null}
          <>
            <div id="drawer" />
          </>
          <div id="content" />
        </div>
      )
    }
    const root = createRoot(container)
    root.render(<App />)
    const drawerBefore = container.querySelector('#drawer') as HTMLDivElement
    const contentBefore = container.querySelector('#content') as HTMLDivElement
    flushSync(() => toggle())
    expect(container.querySelector('#drawer')).toBe(drawerBefore)
    expect(container.querySelector('#content')).toBe(contentBefore)
  })
})

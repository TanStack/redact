import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

describe('hooks', () => {
  it('useEffect runs after mount', async () => {
    const container = setup()
    let calls = 0
    function App() {
      React.useEffect(() => {
        calls++
      }, [])
      return <span>hi</span>
    }
    createRoot(container).render(<App />)
    await Promise.resolve()
    expect(calls).toBe(1)
  })

  it('useEffect cleanup runs on unmount', async () => {
    const container = setup()
    let cleanups = 0
    function App() {
      React.useEffect(() => () => {
        cleanups++
      }, [])
      return <span>hi</span>
    }
    const root = createRoot(container)
    root.render(<App />)
    await Promise.resolve()
    root.unmount()
    expect(cleanups).toBe(1)
  })

  it('useLayoutEffect runs before paint (synchronously)', () => {
    const container = setup()
    let ran = false
    function App() {
      React.useLayoutEffect(() => {
        ran = true
      }, [])
      return <span>hi</span>
    }
    createRoot(container).render(<App />)
    expect(ran).toBe(true) // no await needed
  })

  it('useRef persists across renders', () => {
    const container = setup()
    let refVal: { current: number } | null = null
    function App({ n }: { n: number }) {
      const ref = React.useRef(0)
      if (!refVal) refVal = ref
      else expect(ref).toBe(refVal) // same ref each render
      ref.current = n
      return <span>{n}</span>
    }
    const root = createRoot(container)
    root.render(<App n={1} />)
    root.render(<App n={2} />)
    expect(refVal!.current).toBe(2)
  })

  it('useMemo respects deps', () => {
    const container = setup()
    let computes = 0
    function App({ n }: { n: number }) {
      const v = React.useMemo(() => {
        computes++
        return n * 2
      }, [n])
      return <span>{v}</span>
    }
    const root = createRoot(container)
    root.render(<App n={1} />)
    expect(computes).toBe(1)
    root.render(<App n={1} />)
    expect(computes).toBe(1)
    root.render(<App n={2} />)
    expect(computes).toBe(2)
  })

  it('useReducer', () => {
    const container = setup()
    function reducer(s: number, a: 'inc' | 'dec') {
      return a === 'inc' ? s + 1 : s - 1
    }
    function App() {
      const [n, dispatch] = React.useReducer(reducer, 0)
      return (
        <button id="r" onClick={() => dispatch('inc')}>
          {n}
        </button>
      )
    }
    createRoot(container).render(<App />)
    const btn = container.querySelector('#r') as HTMLButtonElement
    flushSync(() => btn.click())
    flushSync(() => btn.click())
    flushSync(() => btn.click())
    expect(btn.textContent).toBe('3')
  })

  it('forwardRef', () => {
    const container = setup()
    let capturedNode: Element | null = null
    const Comp = React.forwardRef<HTMLDivElement>((props: any, ref) => (
      <div ref={ref}>{props.children}</div>
    ))
    function App() {
      const r = React.useRef<HTMLDivElement>(null)
      React.useLayoutEffect(() => {
        capturedNode = r.current
      }, [])
      return <Comp ref={r}>x</Comp>
    }
    createRoot(container).render(<App />)
    expect(capturedNode).toBeInstanceOf(HTMLDivElement)
  })

  it('memo prevents re-render', () => {
    const container = setup()
    let renders = 0
    const Child = React.memo(function Child({ x }: { x: number }) {
      renders++
      return <span>{x}</span>
    })
    function App({ n, x }: { n: number; x: number }) {
      return (
        <div>
          {n}-<Child x={x} />
        </div>
      )
    }
    const root = createRoot(container)
    root.render(<App n={1} x={10} />)
    expect(renders).toBe(1)
    root.render(<App n={2} x={10} />)
    expect(renders).toBe(1)
    root.render(<App n={3} x={20} />)
    expect(renders).toBe(2)
  })
})

describe('lists and keys', () => {
  it('renders arrays', () => {
    const container = setup()
    function App({ items }: { items: string[] }) {
      return (
        <ul>
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )
    }
    const root = createRoot(container)
    root.render(<App items={['a', 'b', 'c']} />)
    expect(container.innerHTML).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>')
    root.render(<App items={['a', 'c']} />)
    expect(container.innerHTML).toBe('<ul><li>a</li><li>c</li></ul>')
    root.render(<App items={['d', 'a', 'c']} />)
    expect(container.innerHTML).toBe('<ul><li>d</li><li>a</li><li>c</li></ul>')
  })
})

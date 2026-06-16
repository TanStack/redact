import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

function setupWithHTML(html: string) {
  const c = document.createElement('div')
  c.innerHTML = html
  document.body.appendChild(c)
  return c
}

describe('hydrateRoot', () => {
  it('adopts existing DOM without recreating', () => {
    function App() {
      return (
        <div id="x">
          <span>hi</span>
        </div>
      )
    }
    const html = renderToString(<App />)
    expect(html).toBe('<div id="x"><span>hi</span></div>')
    const container = setupWithHTML(html)
    const originalDiv = container.querySelector('div')
    const originalSpan = container.querySelector('span')

    hydrateRoot(container, <App />)

    // Same DOM nodes — not re-created
    expect(container.querySelector('div')).toBe(originalDiv)
    expect(container.querySelector('span')).toBe(originalSpan)
  })

  it('hydrates SVG camelCase attributes using SVG attribute names', () => {
    function App() {
      return (
        <svg viewBox="0 0 10 10">
          <path
            d="M0 0h10"
            fillRule="evenodd"
            strokeLinecap="round"
            strokeWidth={2}
          />
        </svg>
      )
    }

    const html = renderToString(<App />)
    expect(html).toContain('viewBox="0 0 10 10"')
    expect(html).toContain('fill-rule="evenodd"')
    expect(html).toContain('stroke-linecap="round"')
    expect(html).toContain('stroke-width="2"')
    expect(html).not.toContain('strokewidth')

    const container = setupWithHTML(html)
    const originalPath = container.querySelector('path')
    const errors: unknown[] = []

    hydrateRoot(container, <App />, {
      onRecoverableError: (e) => errors.push(e),
    })

    const path = container.querySelector('path') as SVGPathElement
    expect(errors).toEqual([])
    expect(path).toBe(originalPath)
    expect(path.getAttribute('fill-rule')).toBe('evenodd')
    expect(path.getAttribute('stroke-linecap')).toBe('round')
    expect(path.getAttribute('stroke-width')).toBe('2')
  })

  it('hydrates useId attributes with the server prefix', () => {
    function WithId({ label }: { label: string }) {
      const id = React.useId()
      return <button id={`radix-${id}`}>{label}</button>
    }

    function App() {
      return (
        <div>
          <WithId label="one" />
          <WithId label="two" />
        </div>
      )
    }

    const html = renderToString(<App />)
    expect(html).toContain('id="radix-:R0"')
    expect(html).toContain('id="radix-:R1"')

    const container = setupWithHTML(html)
    const originalSecond = container.querySelectorAll('button')[1]
    const errors: unknown[] = []

    hydrateRoot(container, <App />, {
      onRecoverableError: (e) => errors.push(e),
    })

    const second = container.querySelectorAll('button')[1]!
    expect(errors).toEqual([])
    expect(second).toBe(originalSecond)
    expect(second.getAttribute('id')).toBe('radix-:R1')
  })

  it('does not recover solely for generated id attribute drift', () => {
    function App() {
      return (
        <button id="radix-:R9">
          menu
        </button>
      )
    }

    const container = setupWithHTML(
      '<button id="radix-:R7">menu</button>',
    )
    const original = container.querySelector('button')
    const errors: unknown[] = []

    hydrateRoot(container, <App />, {
      onRecoverableError: (e) => errors.push(e),
    })

    const button = container.querySelector('button') as HTMLButtonElement
    expect(errors).toEqual([])
    expect(button).toBe(original)
    expect(button.getAttribute('id')).toBe('radix-:R7')
  })

  it('attaches event handlers to adopted DOM', () => {
    function App() {
      const [n, setN] = React.useState(0)
      return (
        <button id="b" onClick={() => setN(n + 1)}>
          {n}
        </button>
      )
    }
    const html = renderToString(<App />)
    const container = setupWithHTML(html)
    const btn = container.querySelector('#b') as HTMLButtonElement
    expect(btn.textContent).toBe('0')

    hydrateRoot(container, <App />)
    flushSync(() => btn.click())
    expect(btn.textContent).toBe('1')
    flushSync(() => btn.click())
    expect(btn.textContent).toBe('2')
  })

  it('useEffect fires after hydration', async () => {
    let fired = 0
    function App() {
      React.useEffect(() => {
        fired++
      }, [])
      return <span>x</span>
    }
    const html = renderToString(<App />)
    const container = setupWithHTML(html)
    hydrateRoot(container, <App />)
    await Promise.resolve()
    expect(fired).toBe(1)
  })

  it('recovers from mismatch by reporting and rendering fresh', () => {
    function App() {
      return <div>client</div>
    }
    // Server rendered a <span>, client expects a <div>
    const container = setupWithHTML('<span>server</span>')
    let recovered: unknown = null
    hydrateRoot(container, <App />, {
      onRecoverableError: (e) => {
        recovered = e
      },
    })
    expect(recovered).toBeInstanceOf(Error)
    // Should eventually contain the client-rendered div
    expect(container.querySelector('div')?.textContent).toBe('client')
  })

  it('falls back to a clean client render on text mismatch', () => {
    function App() {
      return (
        <button id="choice">
          <span>Solid</span>
        </button>
      )
    }

    const container = setupWithHTML(
      '<button id="choice"><span>React</span><i id="server-only">old</i></button>',
    )
    const original = container.querySelector('#choice')
    const errors: unknown[] = []

    hydrateRoot(container, <App />, {
      onRecoverableError: (e) => errors.push(e),
    })

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('#choice')).not.toBe(original)
    expect(container.querySelectorAll('#choice').length).toBe(1)
    expect(container.querySelector('#choice')?.textContent).toBe('Solid')
    expect(container.querySelector('#server-only')).toBeNull()
  })

  it('falls back to a clean client render on owned attribute mismatch', () => {
    function App() {
      return <img id="logo" alt="Solid" src="/solid.svg" />
    }

    const container = setupWithHTML(
      '<img id="logo" alt="React" src="/react.svg">',
    )
    const original = container.querySelector('#logo')
    const errors: unknown[] = []

    hydrateRoot(container, <App />, {
      onRecoverableError: (e) => errors.push(e),
    })

    const logo = container.querySelector('#logo') as HTMLImageElement
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(logo).not.toBe(original)
    expect(container.querySelectorAll('#logo').length).toBe(1)
    expect(logo.getAttribute('alt')).toBe('Solid')
    expect(logo.getAttribute('src')).toBe('/solid.svg')
  })

  it('clears the container if clean client render also throws', () => {
    function App() {
      throw new Error('boom')
    }

    const container = setupWithHTML('<main><h1>server</h1></main>')

    expect(() => hydrateRoot(container, <App />)).toThrow('boom')
    expect(container.innerHTML).toBe('')
  })

  // Regression: on tanstack.com /stats/npm the chart never renders. SSR
  // rendered a Spinner (isFetching=true server-side); on client after the
  // query settles a Suspense boundary mounts containing a `React.lazy`
  // component. The lazy resolves fine, but a nested component that calls
  // setState in useEffect (e.g. ParentSize measuring the container) doesn't
  // re-render — the chart stays hidden behind `size.width === 0`. This
  // reproduces the whole flow: hydrate mismatch → client-only Suspense →
  // lazy resolves → inner useEffect setState must re-render.
  it('client-only lazy inside suspense mounted post-hydration re-renders on effect setState', async () => {
    // SSR output was different content; hydrate mismatches and falls through.
    const container = setupWithHTML('<div><span>server</span></div>')

    let resolveMod: (v: { default: () => any }) => void
    const Lazy = React.lazy(
      () =>
        new Promise<{ default: () => any }>((r) => {
          resolveMod = r
        }),
    )

    function Measured() {
      const [w, setW] = React.useState(0)
      React.useEffect(() => {
        setW(42)
      }, [])
      return <span>w={w}</span>
    }

    let setShow: (b: boolean) => void = () => {}
    function App() {
      const [show, _setShow] = React.useState(false)
      setShow = _setShow
      return (
        <div>
          {show ? (
            <React.Suspense fallback={<i>load</i>}>
              <Lazy />
            </React.Suspense>
          ) : (
            <span>server</span>
          )}
        </div>
      )
    }

    hydrateRoot(container, <App />)
    // Post-hydrate state change: Suspense+Lazy appears.
    flushSync(() => setShow(true))
    expect(container.querySelector('i')?.textContent).toBe('load')
    resolveMod!({ default: Measured })
    // Let the thenable settle, the Suspense re-render fire, and the nested
    // useEffect's setState re-render follow.
    for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0))
    expect(container.querySelector('span')?.textContent).toBe('w=42')
    expect(container.querySelector('i')).toBeNull()
  })

  // Closer to tanstack.com: the conditional branch uses a nested wrapper
  // element (like the Resizable container) and the state update is async
  // (microtask, not flushSync). The lazy's module resolves asynchronously
  // and the inner component's useEffect fires a setState shortly after.
  it('async-toggled suspense+lazy with intermediate wrapper swaps fallback for real content', async () => {
    const container = setupWithHTML(
      '<div class="wrap"><div class="spinner">spin</div></div>',
    )

    let resolveMod: (v: { default: () => any }) => void
    const Lazy = React.lazy(
      () =>
        new Promise<{ default: () => any }>((r) => {
          resolveMod = r
        }),
    )

    function Measured() {
      const [w, setW] = React.useState(0)
      React.useEffect(() => {
        setW(42)
      }, [])
      return <span data-testid="real">w={w}</span>
    }

    let setReady: (b: boolean) => void = () => {}
    function App() {
      const [ready, _setReady] = React.useState(false)
      setReady = _setReady
      return (
        <div className="wrap">
          {!ready ? (
            <div className="spinner">spin</div>
          ) : (
            <div className="resizable">
              <React.Suspense fallback={<i data-testid="fb">load</i>}>
                <Lazy />
              </React.Suspense>
            </div>
          )}
        </div>
      )
    }

    hydrateRoot(container, <App />)
    // Async state flip (no flushSync).
    setReady(true)
    // Wait a few microtasks for the flush.
    await new Promise((r) => setTimeout(r, 0))
    expect(container.querySelector('[data-testid="fb"]')?.textContent).toBe(
      'load',
    )
    resolveMod!({ default: Measured })
    for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0))
    expect(container.querySelector('[data-testid="real"]')?.textContent).toBe(
      'w=42',
    )
    expect(container.querySelector('[data-testid="fb"]')).toBeNull()
  })
})

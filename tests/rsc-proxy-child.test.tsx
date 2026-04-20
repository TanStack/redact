/**
 * Regression: TanStack's RSC renderable proxy (`createRscProxy({ renderable:
 * true })`) is a `Proxy` wrapping a real React element whose `has` trap
 * returns `true` for ANY string key so nested access (`data.foo.bar`) works.
 *
 * Our reconciler used `'_text' in child` to distinguish our text-child
 * wrapper (`{ _text: string }`) from a React element. For the RSC proxy,
 * `'_text' in proxy` was `true` — so `reconcileChildren` mis-matched it as
 * a text wrapper and set `fiber.pendingProps = child._text`. The proxy's
 * `get` trap for `_text` returned another chained proxy (still a React
 * element); `renderText` then called `createTextNode(element)` which the
 * browser stringified to `"[object Object]"`.
 *
 * Visible as docs pages showing `[object Object]` where the markdown
 * content should be — `/start/latest/docs/framework/react/overview`
 * rendered `<div class="relative">[object Object]</div>` instead of the
 * RSC-rendered article.
 *
 * The fix is to check `$$typeof === undefined` instead of `'_text' in child`:
 * real React elements always carry `$$typeof`, our text wrapper never does,
 * and Proxies can't fake `$$typeof` being absent when they pass through to
 * a target element that has it.
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

/**
 * Simulates TanStack's renderable RSC proxy shape from
 * `@tanstack/react-start-rsc/createRscProxy` with `renderable: true`:
 * a Proxy around a real React element whose `has` trap returns `true` for
 * every string key.
 */
function createRenderableRscProxy(element: React.ReactElement): React.ReactElement {
  return new Proxy(element as any, {
    get(target, prop) {
      // Pass through React-element accessors (props, $$typeof, type, …)
      if (prop in target) return (target as any)[prop]
      // Anything else: in the real RSC proxy this returns a chained proxy
      // representing `element[prop]`. For the shape that trips us up it's
      // enough to return a plausible value — the bug path never uses it.
      return undefined
    },
    has(_target, prop) {
      // The renderable RSC proxy claims every string key exists so
      // `data.foo.bar` access works transparently. This is the trap that
      // fooled `'_text' in child` into returning true for a React element.
      if (typeof prop === 'symbol') return false
      return true
    },
  }) as React.ReactElement
}

describe('RSC renderable proxy as a child (Proxy whose `has` trap claims every string)', () => {
  it('treats a Proxy-element child as a React element, not a text wrapper', async () => {
    const container = setup()

    function Inner() {
      return <span data-testid="inner">rsc-ok</span>
    }

    const rscLike = createRenderableRscProxy(<Inner />)

    function App() {
      // The proxy is passed as a child, same shape as `contentRsc` inside
      // DocFeedbackProvider's `<div class="relative">{children}</div>`.
      return <div data-testid="container">{rscLike}</div>
    }

    createRoot(container).render(<App />)
    await Promise.resolve()

    const el = container.querySelector('[data-testid="container"]')!
    // If the proxy is mis-matched as text, we'd see "[object Object]" here.
    expect(el.textContent).toBe('rsc-ok')
    expect(el.textContent).not.toContain('[object Object]')
    expect(container.querySelector('[data-testid="inner"]')?.textContent).toBe(
      'rsc-ok',
    )
  })

  it('rerenders a Proxy-element child cleanly after a state update', async () => {
    // Covers the update path: reconcileChildren's match loop reuses the
    // existing fiber and sets pendingProps from the new child. The proxy's
    // `has` trap must not fool that branch either.
    const container = setup()

    function Inner({ n }: { n: number }) {
      return <span data-testid="inner">n={n}</span>
    }

    let setN: (n: number) => void = () => {}
    function App() {
      const [n, _setN] = React.useState(0)
      setN = _setN
      const proxied = createRenderableRscProxy(<Inner n={n} />)
      return <div data-testid="container">{proxied}</div>
    }

    createRoot(container).render(<App />)
    await Promise.resolve()
    expect(container.querySelector('[data-testid="inner"]')?.textContent).toBe(
      'n=0',
    )

    setN(5)
    await Promise.resolve()
    await Promise.resolve()
    expect(container.querySelector('[data-testid="inner"]')?.textContent).toBe(
      'n=5',
    )
    expect(container.textContent).not.toContain('[object Object]')
  })

  it('renders a Proxy-element alongside text + element siblings (mixed children)', async () => {
    // The RSC shape from docs pages has the proxy element as one child of a
    // host with other siblings ("prose" wrapper holds the RSC content plus
    // hover buttons). Make sure mixing doesn't confuse the match loop.
    const container = setup()

    function Inner() {
      return <em data-testid="rsc">rsc-content</em>
    }
    const rscLike = createRenderableRscProxy(<Inner />)

    function App() {
      return (
        <div data-testid="wrap">
          <span>before</span>
          {rscLike}
          <span>after</span>
        </div>
      )
    }

    createRoot(container).render(<App />)
    await Promise.resolve()

    const wrap = container.querySelector('[data-testid="wrap"]')!
    expect(wrap.textContent).toBe('beforersc-contentafter')
    expect(wrap.textContent).not.toContain('[object Object]')
  })
})

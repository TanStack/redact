/**
 * Regression: RSC Flight serializes `'use client'` components as RAW lazy
 * objects (`{ $$typeof: REACT_LAZY_TYPE, _payload, _init }`) directly in
 * the tree, NOT wrapped in `{ $$typeof: REACT_ELEMENT_TYPE, type: lazyObj }`.
 *
 * Our reconciler and SSR walker both previously only recognized lazies when
 * they appeared as `element.type` on a regular React element. Raw lazies in
 * child position were dropped silently — so `<CodeBlock>` / `<CodeExplorer>`
 * client components in docs pages never rendered. Code snippets disappeared
 * everywhere (visible on e.g. `/virtual/latest/docs/introduction`).
 *
 * The RSC decoder (server + client) calls `awaitLazyElements` on the decoded
 * tree before the tree is handed to React, so by render time the payload's
 * `status` is already 'fulfilled' and `_init()` returns the resolved element
 * synchronously — our fix just has to recognize the raw Lazy shape and
 * unwrap it in both `pushChildren` (client reconcile) and `walkNode` (SSR).
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

const REACT_LAZY_TYPE = Symbol.for('react.lazy')

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

/**
 * Shape matches what @vitejs/plugin-rsc / @tanstack/react-start-rsc produce
 * for a `'use client'` reference after `awaitLazyElements` has resolved:
 *   { $$typeof: REACT_LAZY_TYPE, _payload: { status: 'fulfilled', value }, _init }
 * where `_init(payload)` returns `payload.value` — the resolved element.
 */
function makeFulfilledRawLazy(element: React.ReactElement): unknown {
  const payload = { status: 'fulfilled', value: element }
  return {
    $$typeof: REACT_LAZY_TYPE,
    _payload: payload,
    _init: (p: any) => p.value,
  }
}

describe('raw REACT_LAZY_TYPE as a child (RSC-serialized client components)', () => {
  describe('SSR walkNode', () => {
    it('renders a raw Lazy child by resolving via _init()', () => {
      function CodeBlockClient() {
        return <pre className="shiki" data-testid="code">const a = 1</pre>
      }
      const lazy = makeFulfilledRawLazy(<CodeBlockClient />)
      function Page() {
        return (
          <div className="prose">
            <p>Before code.</p>
            {lazy as any}
            <p>After code.</p>
          </div>
        )
      }
      const html = renderToString(<Page />)
      // Before the fix: the lazy was silently dropped and the <pre> never
      // appeared in the server HTML.
      expect(html).toContain('<pre class="shiki"')
      expect(html).toContain('const a = 1')
      expect(html).toContain('<p>Before code.</p>')
      expect(html).toContain('<p>After code.</p>')
    })

    it('handles an array of raw Lazies (RSC tree returns tree as an array)', () => {
      const a = makeFulfilledRawLazy(<span data-testid="a">A</span>)
      const b = makeFulfilledRawLazy(<span data-testid="b">B</span>)
      const c = makeFulfilledRawLazy(<span data-testid="c">C</span>)
      function Page() {
        return <div>{[a, b, c] as any}</div>
      }
      const html = renderToString(<Page />)
      expect(html).toContain('<span data-testid="a">A</span>')
      expect(html).toContain('<span data-testid="b">B</span>')
      expect(html).toContain('<span data-testid="c">C</span>')
    })

    it('nested raw Lazy whose resolved element itself contains raw Lazies', () => {
      const leaf = makeFulfilledRawLazy(<em data-testid="leaf">leaf</em>)
      const outer = makeFulfilledRawLazy(
        <section data-testid="outer">{leaf as any}</section>,
      )
      function Page() {
        return <div>{outer as any}</div>
      }
      const html = renderToString(<Page />)
      expect(html).toContain('<section data-testid="outer">')
      expect(html).toContain('<em data-testid="leaf">leaf</em>')
    })
  })

  describe('client pushChildren', () => {
    it('renders a raw Lazy child in the client reconciler', async () => {
      const container = setup()

      function CodeBlockClient({ lang }: { lang: string }) {
        return <pre data-testid="code">lang={lang}</pre>
      }
      const lazy = makeFulfilledRawLazy(<CodeBlockClient lang="tsx" />)

      function App() {
        return (
          <div data-testid="wrap">
            <span>before</span>
            {lazy as any}
            <span>after</span>
          </div>
        )
      }
      createRoot(container).render(<App />)
      await Promise.resolve()

      const wrap = container.querySelector('[data-testid="wrap"]')!
      const code = container.querySelector('[data-testid="code"]')
      // Before the fix: the lazy was silently dropped, the <pre> never
      // entered the DOM, and content between the <span>s was empty.
      expect(code).not.toBeNull()
      expect(code?.textContent).toBe('lang=tsx')
      expect(wrap.textContent).toBe('beforelang=tsxafter')
    })

    it('re-renders a raw Lazy child cleanly after a state update', async () => {
      const container = setup()

      function Inner({ n }: { n: number }) {
        return <span data-testid="inner">n={n}</span>
      }

      let setN: (n: number) => void = () => {}
      function App() {
        const [n, _setN] = React.useState(0)
        setN = _setN
        const lazy = makeFulfilledRawLazy(<Inner n={n} />)
        return <div data-testid="wrap">{lazy as any}</div>
      }
      createRoot(container).render(<App />)
      await Promise.resolve()
      expect(container.querySelector('[data-testid="inner"]')?.textContent).toBe(
        'n=0',
      )

      setN(7)
      await Promise.resolve()
      await Promise.resolve()
      expect(container.querySelector('[data-testid="inner"]')?.textContent).toBe(
        'n=7',
      )
    })
  })
})

import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToReadableStream } from 'react-dom/server'

// Repro of the tanstack.com bug: server renders full real content (the RSC
// Flight tree is synchronously available during SSR). On the client, an
// already-committed-on-server Suspense's descendant still suspends while the
// Flight stream deserializes. The deferred-hydration resume should adopt the
// SSR DOM, not append a fresh copy next to it.

async function streamToHtml(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  out += decoder.decode()
  return out
}

function installContainer(html: string): HTMLDivElement {
  const c = document.createElement('div')
  c.innerHTML = html
  document.body.appendChild(c)
  return c
}

describe('post-suspend resume adopts SSR DOM', () => {
  it('does not duplicate when ancestor is memo-wrapped', async () => {
    // The TanStack Start Match component wraps its children in React.memo.
    // The Suspense + use(promise) child is inside a memo boundary, and the
    // resume-render triggered by the settled thenable may interact with memo
    // equality. Verify the adoption still holds.
    function Inner({ source }: { source: Promise<string> }) {
      const v = React.use(source)
      return (
        <>
          <h2 id="mh1">{v}-memo-heading-1</h2>
          <p>memo-para-1</p>
          <h3 id="mh2">{v}-memo-heading-2</h3>
          <p>memo-para-2</p>
        </>
      )
    }

    const Outer = React.memo(function OuterImpl({ source }: { source: Promise<string> }) {
      return (
        <React.Suspense fallback={<span>loading</span>}>
          <Inner source={source} />
        </React.Suspense>
      )
    })

    const MemoMid = React.memo(function Mid({ source }: { source: Promise<string> }) {
      return (
        <div className="relative">
          <Outer source={source} />
        </div>
      )
    })

    function App({ source }: { source: Promise<string> }) {
      return (
        <div className="prose">
          <MemoMid source={source} />
        </div>
      )
    }

    const pServer = Promise.resolve('ok')
    ;(pServer as any).status = 'fulfilled'
    ;(pServer as any).value = 'ok'

    const stream = await renderToReadableStream(<App source={pServer} />)
    const html = await streamToHtml(stream)
    expect(html.match(/id="mh1"/g)?.length).toBe(1)

    const container = installContainer(html)
    let resolveClient!: (v: string) => void
    const pClient = new Promise<string>((r) => (resolveClient = r))
    hydrateRoot(container, <App source={pClient} />)

    resolveClient('ok')
    await Promise.resolve()
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(container.querySelectorAll('#mh1').length).toBe(1)
    expect(container.querySelectorAll('#mh2').length).toBe(1)
    expect(container.querySelectorAll('.relative').length).toBe(1)
  })

  it('does not duplicate content when a use(promise) suspends during hydration (wrapped pattern)', async () => {
    // Mirrors TanStack Start's RSC client pattern:
    //   RscNodeRenderer (outer function) → Suspense → RscNodeRenderInner (suspends via use())
    // All inside a host div, representative of the prose/.relative container on
    // tanstack.com docs pages.
    function Inner({ source }: { source: Promise<string> }) {
      const v = React.use(source)
      return (
        <>
          <h2 id="h1">{v}-heading-1</h2>
          <p>para-1</p>
          <h3 id="h2">{v}-heading-2</h3>
          <p>para-2</p>
        </>
      )
    }

    function Outer({ source }: { source: Promise<string> }) {
      return (
        <React.Suspense fallback={<span>loading</span>}>
          <Inner source={source} />
        </React.Suspense>
      )
    }

    function App({ source }: { source: Promise<string> }) {
      return (
        <div className="wrap">
          <Outer source={source} />
        </div>
      )
    }

    // Server renders with a resolved promise — full content in SSR HTML.
    const pServer = Promise.resolve('ok')
    ;(pServer as any).status = 'fulfilled'
    ;(pServer as any).value = 'ok'

    const stream = await renderToReadableStream(<App source={pServer} />)
    const html = await streamToHtml(stream)
    // Sanity check: SSR HTML should have exactly one copy of each heading
    expect(html.match(/id="h1"/g)?.length).toBe(1)
    expect(html.match(/id="h2"/g)?.length).toBe(1)

    const container = installContainer(html)
    const beforeH1 = container.querySelectorAll('#h1').length
    const beforeH2 = container.querySelectorAll('#h2').length
    expect(beforeH1).toBe(1)
    expect(beforeH2).toBe(1)

    // Client hydrates with a pending promise — Inner will suspend.
    let resolveClient!: (v: string) => void
    const pClient = new Promise<string>((r) => (resolveClient = r))

    hydrateRoot(container, <App source={pClient} />)

    // Inner is suspended; the Suspense fallback is what's "live" in React's
    // tree, but the SSR real content is still in the DOM.
    expect(container.querySelectorAll('#h1').length).toBe(1)

    // Resolve the client's promise so use() can settle.
    resolveClient('ok')
    // Let the microtask(s) drain so the deferred-hydration resume runs.
    await Promise.resolve()
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))

    // The bug: after resume, the inner render creates fresh DOM next to the
    // SSR DOM → 2 copies of every element. The fix: resume should re-enter
    // hydration mode so children adopt the existing SSR DOM.
    const afterH1 = container.querySelectorAll('#h1').length
    const afterH2 = container.querySelectorAll('#h2').length
    expect(afterH1).toBe(1)
    expect(afterH2).toBe(1)
  })
})

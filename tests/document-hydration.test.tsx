import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

// Reproduces the pattern Start uses: hydrateRoot(document, <html>...</html>).
// The document already has <!doctype html><html>...</html> parsed from the
// server HTML; our shim must adopt the existing <html> element, not append a
// new one. After hydration, state updates in descendants must re-render
// without trying to add a second <html> to the document.

describe('hydrateRoot(document, <html/>)', () => {
  function buildDocumentFrom(html: string): Document {
    const dom = new (globalThis as any).DOMParser().parseFromString(html, 'text/html')
    return dom
  }

  it('adopts existing <html> without recreating', () => {
    function App() {
      return (
        <html>
          <head>
            <title>test</title>
          </head>
          <body>
            <h1>hi</h1>
          </body>
        </html>
      )
    }
    const html = renderToString(<App />)
    const doc = buildDocumentFrom('<!doctype html>' + html)
    const origHtml = doc.documentElement
    hydrateRoot(doc as any, <App />)
    expect(doc.documentElement).toBe(origHtml)
    expect(doc.documentElement.querySelector('h1')?.textContent).toBe('hi')
  })

  it('server-renders a head when an html tree omits it', () => {
    function App() {
      return (
        <html>
          <body>
            <h1>hi</h1>
          </body>
        </html>
      )
    }

    expect(renderToString(<App />)).toBe(
      '<!DOCTYPE html><html><head></head><body><h1>hi</h1></body></html>',
    )
  })

  it('hydrates React 19-style top-level head tags from document.head', () => {
    function App() {
      return (
        <>
          <meta name="viewport" content="width=device-width" />
          <html>
            <body>
              <h1>hi</h1>
            </body>
          </html>
        </>
      )
    }

    const doc = buildDocumentFrom(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><h1>hi</h1></body></html>',
    )
    const origHtml = doc.documentElement
    const errors: unknown[] = []

    hydrateRoot(doc as any, <App />, {
      onRecoverableError: (e) => errors.push(e),
      onUncaughtError: (e) => errors.push(e),
    })

    expect(doc.documentElement).toBe(origHtml)
    expect(doc.head.querySelectorAll('meta[name="viewport"]').length).toBe(1)
    expect(doc.documentElement.querySelector('h1')?.textContent).toBe('hi')
    expect(errors).toEqual([])
  })

  it('tolerates SSR-only scripts after document body app children', () => {
    function App() {
      return (
        <html>
          <head>
            <title>test</title>
          </head>
          <body>
            <h1>hi</h1>
          </body>
        </html>
      )
    }

    const doc = buildDocumentFrom(
      '<!doctype html><html><head><title>test</title></head><body><h1>hi</h1><script type="module" async>window.__vite=1</script></body></html>',
    )
    const script = doc.body.querySelector('script')
    const errors: unknown[] = []

    hydrateRoot(doc as any, <App />, {
      onRecoverableError: (e) => errors.push(e),
    })

    expect(errors).toEqual([])
    expect(doc.body.querySelector('h1')?.textContent).toBe('hi')
    expect(doc.body.querySelector('script')).toBe(script)
  })

  it('a root-level component suspending during hydration does not append a second <html>', async () => {
    // Mirrors Start's <StartClient/> → <Await promise={...}> pattern: the
    // root-most component throws a promise synchronously during hydrateRoot.
    // While pending, the DOM must be left as-is. When the promise resolves,
    // the real tree (with its own <html>) must ADOPT the existing <html>,
    // not create a new one.
    // Mirrors Start's actual tree shape:
    //   hydrateRoot(document, <StartClient/>) where StartClient returns <Await>
    //   and Await suspends BEFORE any <html> has been rendered.
    let resolve!: (app: () => React.ReactElement) => void
    const p = new Promise<() => React.ReactElement>((r) => (resolve = r))
    function Await() {
      const Component = React.use(p)
      return <Component />
    }
    function StartClientLike() {
      return <Await />
    }
    function RealApp() {
      return (
        <html>
          <head>
            <title>x</title>
          </head>
          <body>
            <h1 id="real">real</h1>
          </body>
        </html>
      )
    }
    // Server output: assume Inner already resolved server-side (like Start).
    const serverHtml = '<!doctype html><html><head><title>x</title></head><body><h1 id="real">real</h1></body></html>'
    const doc = buildDocumentFrom(serverHtml)
    const origHtml = doc.documentElement

    // Client: promise NOT yet resolved — StartClientLike → Await will suspend
    // before ever reaching the <html>.
    const errors: unknown[] = []
    hydrateRoot(doc as any, <StartClientLike />, {
      onRecoverableError: (e) => errors.push(e),
      onUncaughtError: (e) => errors.push(e),
    })
    // DOM shouldn't have been mutated yet (fallback wasn't rendered; root is untouched)
    expect(doc.documentElement).toBe(origHtml)
    const htmlCountPending = Array.from(doc.childNodes).filter(
      (n) => n.nodeType === 1 && (n as Element).tagName.toLowerCase() === 'html',
    ).length
    expect(htmlCountPending).toBe(1)

    // Now resolve with the real app component. Flush microtasks.
    resolve(RealApp)
    await new Promise((r) => setTimeout(r, 0))
    for (let i = 0; i < 5; i++) await Promise.resolve()

    // After resolve, existing DOM is adopted — still one <html>
    const htmlCountDone = Array.from(doc.childNodes).filter(
      (n) => n.nodeType === 1 && (n as Element).tagName.toLowerCase() === 'html',
    ).length
    expect(htmlCountDone).toBe(1)
    expect(doc.documentElement).toBe(origHtml)
    expect(errors).toEqual([])
  })

  it('state update in a descendant does not try to append a second <html>', async () => {
    function Inner() {
      const [n, setN] = React.useState(0)
      return (
        <button id="b" onClick={() => setN(n + 1)}>
          {n}
        </button>
      )
    }
    function App() {
      return (
        <html>
          <head>
            <title>test</title>
          </head>
          <body>
            <Inner />
          </body>
        </html>
      )
    }
    const html = renderToString(<App />)
    const doc = buildDocumentFrom('<!doctype html>' + html)
    hydrateRoot(doc as any, <App />)

    const btn = doc.querySelector('#b') as HTMLButtonElement
    expect(btn.textContent).toBe('0')
    // The click triggers a tree re-render; if our reconciler mis-handles
    // the root/document relationship, it throws "Only one element on document".
    flushSync(() => btn.click())
    expect(btn.textContent).toBe('1')
    // And there's still exactly one documentElement
    expect(doc.childNodes.length).toBeGreaterThan(0)
    const htmlEls = Array.from(doc.childNodes).filter(
      (n) => n.nodeType === 1 && (n as Element).tagName.toLowerCase() === 'html',
    )
    expect(htmlEls.length).toBe(1)
  })

  it('falls back to body-only client render on document body text mismatch', () => {
    function App() {
      return (
        <html>
          <head>
            <title>client</title>
            <style id="critical">{'body{color:red}'}</style>
          </head>
          <body>
            <nav id="nav">nav</nav>
            <h1 id="title">Solid</h1>
          </body>
        </html>
      )
    }

    const doc = buildDocumentFrom(
      '<!doctype html><html><head><title>client</title><style id="critical">body{color:red}</style></head><body><nav id="nav">nav</nav><h1 id="title">React</h1><p id="old">old</p></body></html>',
    )
    const origHtml = doc.documentElement
    const origHead = doc.head
    const origStyle = doc.querySelector('#critical')
    const errors: unknown[] = []

    hydrateRoot(doc as any, <App />, {
      onRecoverableError: (e) => errors.push(e),
    })

    const htmlEls = Array.from(doc.childNodes).filter(
      (n) => n.nodeType === 1 && (n as Element).tagName.toLowerCase() === 'html',
    )
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(htmlEls.length).toBe(1)
    expect(doc.documentElement).toBe(origHtml)
    expect(doc.head).toBe(origHead)
    expect(doc.querySelector('#critical')).toBe(origStyle)
    expect(doc.querySelector('#title')?.textContent).toBe('Solid')
    expect(doc.querySelector('#old')).toBeNull()
  })

  it('recovers a Suspense mismatch inside document body without replacing head or outer body siblings', () => {
    function App({ label }: { label: string }) {
      return (
        <html>
          <head>
            <title>client</title>
            <style id="critical">{'body{color:red}'}</style>
          </head>
          <body>
            <header id="shell">shell</header>
            <React.Suspense fallback={<i>loading</i>}>
              <main id="route">{label}</main>
            </React.Suspense>
            <footer id="foot">foot</footer>
          </body>
        </html>
      )
    }

    const html = renderToString(<App label="React" />)
    const doc = buildDocumentFrom(html)
    const origHtml = doc.documentElement
    const origHead = doc.head
    const origStyle = doc.querySelector('#critical')
    const shell = doc.querySelector('#shell')
    const foot = doc.querySelector('#foot')
    const errors: unknown[] = []

    hydrateRoot(doc as any, <App label="Solid" />, {
      onRecoverableError: (e) => errors.push(e),
    })

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(doc.documentElement).toBe(origHtml)
    expect(doc.head).toBe(origHead)
    expect(doc.querySelector('#critical')).toBe(origStyle)
    expect(doc.querySelector('#shell')).toBe(shell)
    expect(doc.querySelector('#foot')).toBe(foot)
    expect(doc.querySelectorAll('#route').length).toBe(1)
    expect(doc.querySelector('#route')?.textContent).toBe('Solid')
  })
})

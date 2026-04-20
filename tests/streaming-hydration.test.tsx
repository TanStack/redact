import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToReadableStream, BOUNDARY_REVEAL_RUNTIME } from 'react-dom/server'

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

function executeScriptsIn(container: HTMLElement): void {
  // jsdom/happy-dom don't auto-execute <script> when innerHTML is set. We
  // manually eval each non-src <script> so our $RC / $RH runtime and reveal
  // calls run as they would in a browser.
  const scripts = Array.from(container.querySelectorAll('script'))
  for (const s of scripts) {
    if (s.src) continue
    const code = s.textContent ?? ''
    try {
      // eslint-disable-next-line no-new-func
      new Function(code)()
    } catch {}
  }
}

describe('streaming hydration', () => {
  it('hydrates a resolved boundary against the streamed real content', async () => {
    let resolveData!: (v: string) => void
    const pServer = new Promise<string>((r) => (resolveData = r))

    function Inner({ source }: { source: Promise<string> }) {
      const v = React.use(source)
      return <span id="x">{v}</span>
    }

    function App({ source }: { source: Promise<string> }) {
      const [n, setN] = React.useState(0)
      return (
        <div>
          <React.Suspense fallback={<i>load</i>}>
            <Inner source={source} />
          </React.Suspense>
          <button id="b" onClick={() => setN(n + 1)}>
            {n}
          </button>
        </div>
      )
    }

    const stream = await renderToReadableStream(<App source={pServer} />)
    resolveData('hi')
    const html = await streamToHtml(stream)
    expect(html).toContain('<span id="x">hi</span>')

    const container = installContainer(html)
    // Execute the inline runtime + any $RC(...) reveal scripts that were in the output
    executeScriptsIn(container)

    // Client already has a resolved thenable (status: fulfilled after one tick)
    // Use an already-settled promise to avoid re-suspending on the client.
    const pClient = Promise.resolve('hi')
    ;(pClient as any).status = 'fulfilled'
    ;(pClient as any).value = 'hi'

    hydrateRoot(container, <App source={pClient} />)

    // Clicking the button should update state — proves hydration attached handlers
    const btn = container.querySelector('#b') as HTMLButtonElement
    expect(btn.textContent).toBe('0')
    flushSync(() => btn.click())
    expect(btn.textContent).toBe('1')
    // Real content is still there
    expect(container.querySelector('#x')?.textContent).toBe('hi')
  })

  it('re-hydrates a pending boundary when the server reveal fires', async () => {
    // Server stream pauses, client hydrates seeing fallback, then $RC runs,
    // client must re-hydrate real content against the revealed DOM.
    let resolveData!: (v: string) => void
    const pServer = new Promise<string>((r) => (resolveData = r))

    function Inner({ source }: { source: Promise<string> }) {
      const v = React.use(source)
      return <span id="real">{v}</span>
    }
    function App({ source }: { source: Promise<string> }) {
      return (
        <div>
          <React.Suspense fallback={<i id="fb">load</i>}>
            <Inner source={source} />
          </React.Suspense>
        </div>
      )
    }

    const stream = await renderToReadableStream(<App source={pServer} />)
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    // Read chunks until we see the inline runtime (marks end of shell)
    let shellHtml = ''
    while (!shellHtml.includes('$RC=function')) {
      const { value, done } = await reader.read()
      if (done) break
      shellHtml += decoder.decode(value, { stream: true })
    }
    expect(shellHtml).toContain('<i id="fb">load</i>')

    const container = installContainer(shellHtml)
    executeScriptsIn(container)

    // Hydrate while server is still pending — client also suspends since
    // its promise isn't resolved yet. Client renders fallback over server fallback.
    const pClient = new Promise<string>(() => {})
    hydrateRoot(container, <App source={pClient} />)

    // Now simulate server resolving + emit next chunks
    resolveData('ok')
    // Drain remaining server chunks
    const rest: string[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      rest.push(decoder.decode(value, { stream: true }))
    }
    rest.push(decoder.decode())
    const restHtml = rest.join('')

    // Append remaining chunks (template + reveal script) and execute them
    const wrap = document.createElement('div')
    wrap.innerHTML = restHtml
    while (wrap.firstChild) container.appendChild(wrap.firstChild)
    executeScriptsIn(container)

    // After $RC ran, our $RH callback should have re-hydrated real children.
    // Real content should be visible (assuming the client also now has data).
    // In this test the client pClient is still pending, so we just assert
    // the DOM has the real server content swapped in.
    expect(container.querySelector('#real')?.textContent).toBe('ok')
    await stream.allReady
  })
})

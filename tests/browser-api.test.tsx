import { afterEach, describe, expect, it, vi } from 'vitest'
import { Suspense, use, useLayoutEffect, createContext, useContext, useId } from 'react'
import { browser, flushSync } from 'react-dom'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import * as Server from 'react-dom/server'

const { renderToPipeableStream, renderToReadableStream, renderToString } = Server

const roots: Root[] = []
afterEach(() => { for (const root of roots.splice(0)) flushSync(() => root.unmount()); document.body.textContent = '' })
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 20))
function container() { const el = document.createElement('div'); document.body.append(el); return el }
function ClientOnly() { expect(use(browser())).toBeUndefined(); return <b>client content</b> }
async function html(node: any, options: any = {}) {
  const stream = await renderToReadableStream(node, options)
  await stream.allReady
  return new Response(stream).text()
}
const executed = new WeakSet<Element>()
function runScripts(el: Element) {
  for (const script of el.querySelectorAll('script')) {
    if (!script.src && !executed.has(script)) { executed.add(script); window.eval(script.textContent || '') }
  }
}

describe('browser-only rendering', () => {
  it('does nothing until consumed, and never calls a reason in the client', () => {
    const reason = vi.fn(() => 'private')
    const token = browser(reason)
    expect(reason).not.toHaveBeenCalled()
    function App() { expect(use(token)).toBeUndefined(); return <b>ready</b> }
    const el = container(); const root = createRoot(el); roots.push(root)
    flushSync(() => root.render(<App />))
    expect(el.textContent).toBe('ready'); expect(reason).not.toHaveBeenCalled()
  })

  it('leaves a server fallback and reports the lazy cause and component stack once', async () => {
    const cause = new Error('private reason')
    const reason = vi.fn(() => cause); const onError = vi.fn(); const onBrowserBailout = vi.fn()
    function BrowserChild() { use(browser(reason)); return <b>not on server</b> }
    function BrowserParent() { return <BrowserChild /> }
    const output = await html(<Suspense fallback={<i>loading</i>}><BrowserParent /></Suspense>, { onError, onBrowserBailout })
    expect(output).toContain('<i>loading</i>'); expect(output).not.toContain('not on server'); expect(output).not.toContain('private reason')
    expect(reason).toHaveBeenCalledTimes(1); expect(onError).not.toHaveBeenCalled(); expect(onBrowserBailout).toHaveBeenCalledTimes(1)
    expect(onBrowserBailout.mock.calls[0]![0]).toBeInstanceOf(Error)
    expect(onBrowserBailout.mock.calls[0]![0].cause).toBe(cause)
    expect(onBrowserBailout.mock.calls[0]![1].componentStack).toContain('BrowserChild')
    expect(onBrowserBailout.mock.calls[0]![1].componentStack).toContain('BrowserParent')
  })

  it('uses the closest boundary and leaves its sibling intact', async () => {
    const output = await html(<Suspense fallback="outer"><span>before</span><Suspense fallback="inner"><ClientOnly /></Suspense><span>after</span></Suspense>)
    expect(output).toContain('inner'); expect(output).not.toContain('outer'); expect(output).toContain('before'); expect(output).toContain('after')
  })

  it('supports renderToString and silently switches the boundary during hydration', async () => {
    const tree = <><span>before</span><Suspense fallback={<i>loading</i>}><ClientOnly /></Suspense><span>after</span></>
    const el = container(); el.innerHTML = renderToString(tree)
    const before = el.firstChild; const after = el.lastChild; const onRecoverableError = vi.fn()
    roots.push(hydrateRoot(el, tree, { onRecoverableError }))
    await tick()
    expect(el.textContent).toBe('beforeclient contentafter')
    expect(el.firstChild).toBe(before); expect(el.lastChild).toBe(after)
    expect(onRecoverableError).not.toHaveBeenCalled()
  })

  it('hydrates nested boundaries without consuming outside siblings', async () => {
    const tree = <Suspense fallback="outer"><Suspense fallback="loading"><ClientOnly /></Suspense><span>after</span></Suspense>
    const el = container(); el.innerHTML = await html(tree); const onRecoverableError = vi.fn()
    roots.push(hydrateRoot(el, tree, { onRecoverableError })); await tick()
    expect(el.textContent).toBe('client contentafter'); expect(onRecoverableError).not.toHaveBeenCalled()
  })

  it('initializes the same token on each server encounter', async () => {
    const reason = vi.fn(() => 'reason'); const token = browser(reason)
    function Child() { use(token); return null }
    await html(<><Suspense fallback="a"><Child /></Suspense><Suspense fallback="b"><Child /></Suspense></>)
    expect(reason).toHaveBeenCalledTimes(2)
  })

  it('does not let a throwing reason turn an intentional bailout into an error', async () => {
    const onBrowserBailout = vi.fn(); const onError = vi.fn()
    function Child() { use(browser(() => { throw new Error('private') })); return null }
    await html(<Suspense fallback="fallback"><Child /></Suspense>, { onBrowserBailout, onError })
    expect(onError).not.toHaveBeenCalled(); expect(onBrowserBailout.mock.calls[0]![0].cause).toContain('initializer threw')
  })

  it('reports a missing boundary through normal pipeable shell error callbacks', async () => {
    const onBrowserBailout = vi.fn(); const onError = vi.fn(); const onShellError = vi.fn()
    renderToPipeableStream(<ClientOnly />, { onBrowserBailout, onError, onShellError })
    await tick()
    expect(onBrowserBailout).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalledTimes(1); expect(onShellError).toHaveBeenCalledTimes(1)
    expect(onShellError.mock.calls[0]![0]).toBeInstanceOf(Error)
  })

  it('does not swallow a browser bailout thrown from a fallback', async () => {
    const never = new Promise(() => {})
    function Pending() { use(never); return null }
    const controller = new AbortController()
    const stream = await renderToReadableStream(<Suspense fallback="outer"><Suspense fallback={<ClientOnly />}><Pending /></Suspense></Suspense>, { signal: controller.signal })
    const reader = stream.getReader()
    const output = new TextDecoder().decode((await reader.read()).value)
    expect(output).toContain('outer')
    controller.abort(browser()); await stream.allReady; reader.releaseLock()
  })

  it('aborts pending readable boundaries with browser reasons and settles allReady', async () => {
    const controller = new AbortController(); const never = new Promise(() => {})
    function Pending() { use(never); return null }
    const onError = vi.fn(); const onBrowserBailout = vi.fn(); const reason = vi.fn(() => 'timeout')
    const stream = await renderToReadableStream(<><Suspense fallback="a"><Pending /></Suspense><Suspense fallback="b"><Pending /></Suspense></>, { signal: controller.signal, onError, onBrowserBailout })
    controller.abort(browser(reason)); await stream.allReady
    await new Response(stream).text()
    expect(onError).not.toHaveBeenCalled(); expect(onBrowserBailout).toHaveBeenCalledTimes(2); expect(reason).toHaveBeenCalledTimes(1)
    for (const [error, info] of onBrowserBailout.mock.calls) { expect(error.cause).toBe('timeout'); expect(info.componentStack).toContain('Pending') }
  })

  it('aborts pending pipeable boundaries and reports completion', async () => {
    const never = new Promise(() => {}); function Pending() { use(never); return null }
    const onError = vi.fn(); const onBrowserBailout = vi.fn(); const onAllReady = vi.fn()
    const handle = renderToPipeableStream(<Suspense fallback="loading"><Pending /></Suspense>, {
      onError, onBrowserBailout, onAllReady, onShellReady() { handle.abort(browser('timeout')) },
    })
    await tick()
    expect(onError).not.toHaveBeenCalled(); expect(onBrowserBailout).toHaveBeenCalledTimes(1); expect(onAllReady).toHaveBeenCalledTimes(1)
  })

  it('rejects an already-aborted readable render through its normal error callback', async () => {
    const controller = new AbortController(); controller.abort(browser('aborted early'))
    const onError = vi.fn(); const onBrowserBailout = vi.fn()
    await expect(renderToReadableStream(<b>ready</b>, { signal: controller.signal, onError, onBrowserBailout })).rejects.toBeInstanceOf(Error)
    expect(onError).toHaveBeenCalledTimes(1); expect(onBrowserBailout).not.toHaveBeenCalled()
  })

  it('aborts a pending root without a boundary as a shell failure', async () => {
    const controller = new AbortController(); const never = new Promise(() => {})
    function Pending() { use(never); return null }
    const onError = vi.fn(); const onBrowserBailout = vi.fn()
    const stream = renderToReadableStream(<Pending />, { signal: controller.signal, onError, onBrowserBailout })
    controller.abort(browser('root timeout'))
    await expect(stream).rejects.toBeInstanceOf(Error)
    expect(onError).toHaveBeenCalledTimes(1); expect(onBrowserBailout).not.toHaveBeenCalled()
  })

  it.each([false, true])('silently recovers a browser-aborted boundary, hydrated before abort: %s', async (hydrateFirst) => {
    const controller = new AbortController(); const never = new Promise(() => {})
    function Pending({ server = false }: { server?: boolean }) {
      if (server) use(never)
      return <b>client ready</b>
    }
    const tree = (server: boolean) => <div><Suspense fallback={<i>loading</i>}><Pending server={server} /></Suspense><span>after</span></div>
    const stream = await renderToReadableStream(tree(true), { signal: controller.signal })
    const reader = stream.getReader(); const decoder = new TextDecoder(); const el = container()
    el.innerHTML = decoder.decode((await reader.read()).value); runScripts(el)
    const onRecoverableError = vi.fn(); const after = el.querySelector('span')
    if (hydrateFirst) roots.push(hydrateRoot(el, tree(false), { onRecoverableError }))
    controller.abort(browser('timeout')); await stream.allReady
    const rest = document.createElement('div')
    while (true) { const part = await reader.read(); if (part.done) break; rest.insertAdjacentHTML('beforeend', decoder.decode(part.value)) }
    el.append(...rest.childNodes); runScripts(el)
    if (!hydrateFirst) roots.push(hydrateRoot(el, tree(false), { onRecoverableError }))
    await tick()
    expect(el.querySelector('b')?.textContent).toBe('client ready'); expect(el.querySelector('i')).toBeNull()
    expect(el.querySelector('span')).toBe(after); expect(onRecoverableError).not.toHaveBeenCalled()
  })

  it('drops unfinished nested server tasks when the outer boundary opts into browser rendering', async () => {
    const never = new Promise(() => {}); function Pending() { use(never); return null }
    const controller = new AbortController()
    const stream = await renderToReadableStream(<Suspense fallback="outer"><Suspense fallback="inner"><Pending /></Suspense><ClientOnly /></Suspense>, { signal: controller.signal })
    // React may still finish discarded work asynchronously. A browser abort also
    // guarantees no unresolved application promise can keep this request alive.
    controller.abort(browser()); await stream.allReady
    expect(await new Response(stream).text()).toContain('outer')
  })

  it('reports a browser bailout when suspended work retries', async () => {
    let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r })
    const onBrowserBailout = vi.fn(); const onError = vi.fn()
    function Later() { use(promise); use(browser('after data')); return null }
    const stream = await renderToReadableStream(<Suspense fallback="wait"><Later /></Suspense>, { onBrowserBailout, onError })
    resolve(); await stream.allReady; await new Response(stream).text()
    expect(onError).not.toHaveBeenCalled(); expect(onBrowserBailout).toHaveBeenCalledTimes(1)
    expect(onBrowserBailout.mock.calls[0]![1].componentStack).toContain('Later')
  })

  it('does not reinterpret a directly thrown browser token as a valid bailout', async () => {
    const token = browser('reason'); const onError = vi.fn(); const onBrowserBailout = vi.fn()
    function ThrowsToken() { throw token }
    await expect(renderToReadableStream(<ThrowsToken />, { onError, onBrowserBailout })).rejects.toBe(token)
    expect(onError).toHaveBeenCalledTimes(1); expect(onError.mock.calls[0]![0]).toBe(token); expect(onBrowserBailout).not.toHaveBeenCalled()
  })

  it('keeps ordinary abort failures separate from browser bailouts', async () => {
    const controller = new AbortController(); const never = new Promise(() => {})
    function Pending() { use(never); return null }
    const onError = vi.fn(); const onBrowserBailout = vi.fn(); const failure = new Error('failed')
    const stream = await renderToReadableStream(<Suspense fallback="wait"><Pending /></Suspense>, { signal: controller.signal, onError, onBrowserBailout })
    controller.abort(failure); await stream.allReady; await new Response(stream).text()
    expect(onError).toHaveBeenCalledTimes(1); expect(onError.mock.calls[0]![0]).toBe(failure); expect(onBrowserBailout).not.toHaveBeenCalled()
  })

  it('retains client Suspense fallback while browser-only content waits for data', async () => {
    let resolve!: (value: string) => void; const promise = new Promise<string>((r) => { resolve = r })
    function Child() { use(browser()); return <b>{use(promise)}</b> }
    const effect = vi.fn(); function Before() { useLayoutEffect(effect, []); return <span>before</span> }
    const tree = <><Before /><Suspense fallback={<i>loading</i>}><Child /></Suspense></>
    const el = container(); el.innerHTML = await html(tree); const onRecoverableError = vi.fn()
    roots.push(hydrateRoot(el, tree, { onRecoverableError })); await tick()
    expect(el.querySelector('i')?.textContent).toBe('loading'); expect(effect).toHaveBeenCalledTimes(1)
    resolve('loaded')
    await vi.waitFor(() => {
      expect(el.querySelector('b')?.textContent).toBe('loaded'); expect(el.querySelector('i')).toBeNull()
    })
    expect(onRecoverableError).not.toHaveBeenCalled()
  })

  it('isolates concurrent server requests and preserves IDs when suspended boundaries resume', async () => {
    const Context = createContext('outside')
    let resolveA!: () => void; let resolveB!: () => void
    const a = new Promise<void>((r) => { resolveA = r }); const b = new Promise<void>((r) => { resolveB = r })
    function Later({ wait }: { wait: Promise<void> }) { use(wait); return <b id={useId()}>{useContext(Context)}</b> }
    function App({ value, wait }: { value: string; wait: Promise<void> }) {
      const id = useId()
      return <Context.Provider value={value}><span id={id}>shell</span><Suspense fallback="loading"><Later wait={wait} /></Suspense></Context.Provider>
    }
    const streamA = await renderToReadableStream(<App value="request-a" wait={a} />, { identifierPrefix: 'a-' })
    const streamB = await renderToReadableStream(<App value="request-b" wait={b} />, { identifierPrefix: 'b-' })
    function Outside() { return <i>{useContext(Context)}</i> }
    expect(renderToString(<Outside />)).toBe('<i>outside</i>')
    resolveA(); await streamA.allReady; resolveB(); await streamB.allReady
    for (const [stream, label, prefix] of [[streamA, 'request-a', 'a-'], [streamB, 'request-b', 'b-']] as const) {
      const output = await new Response(stream).text(); const el = document.createElement('div'); el.innerHTML = output
      const span = el.querySelector('span')!; const bold = el.querySelector('b')!
      expect(bold.textContent).toBe(label); expect(span.id).not.toBe(bold.id)
      expect(span.id).toContain(prefix); expect(bold.id).toContain(prefix)
    }
  })

  it('waits for a suspended root to complete before resolving the readable stream', async () => {
    let resolve!: (value: string) => void; const wait = new Promise<string>((r) => { resolve = r })
    function App() { return <main>{use(wait)}</main> }
    const ready = vi.fn(); const pending = renderToReadableStream(<App />).then((stream) => { ready(); return stream })
    await Promise.resolve(); await Promise.resolve(); expect(ready).not.toHaveBeenCalled()
    resolve('ready'); const stream = await pending
    expect(await new Response(stream).text()).toBe('<main>ready</main>'); await stream.allReady
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('terminates a late pipeable destination when a browser bailout callback fails after the shell', async () => {
    let resolve!: () => void; const wait = new Promise<void>((r) => { resolve = r })
    function Child() { use(wait); use(browser()); return null }
    const failure = new Error('bailout callback failed'); const onError = vi.fn(); const onAllReady = vi.fn()
    const handle = renderToPipeableStream(<Suspense fallback="loading"><Child /></Suspense>, {
      onError, onAllReady, onBrowserBailout() { throw failure },
    })
    await tick(); resolve(); await tick()
    const end = vi.fn(); const destroy = vi.fn()
    const target = { write: vi.fn(), end, destroy, on() { return this }, removeListener() { return this } }
    handle.pipe(target as any)
    expect(destroy).toHaveBeenCalledWith(failure); expect(end).not.toHaveBeenCalled()
    expect(onAllReady).not.toHaveBeenCalled()
  })
})

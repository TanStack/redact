import { describe, expect, it, vi } from 'vitest'
import { Suspense, use, useId, useState, type ReactNode } from 'react'
import { flushSync, preinit } from 'react-dom'
import { hydrateRoot } from 'react-dom/client'
import { renderToPipeableStream, renderToReadableStream } from 'react-dom/server'

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function deferred<T = void>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function settled<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: 'fulfilled', value })
}

function Read({ source, id }: { source: Promise<string>; id: string }) {
  return <section id={id}>{use(source)}</section>
}

function pipe(element: ReactNode): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = ''
    const handle = renderToPipeableStream(element, {
      onShellError: reject,
      onAllReady() {
        handle.pipe({ write(chunk: string) { html += chunk }, end() { resolve(html) } })
      },
    })
  })
}

function Counter({ source, name }: { source: Promise<string>; name: string }) {
  const [count, setCount] = useState(0)
  return <button id={name} onClick={() => setCount(count + 1)}>{use(source)}:{count}</button>
}

function Counters({ a, b }: { a: Promise<string>; b: Promise<string> }) {
  return (
    <div>
      <Suspense fallback={<i>a loading</i>}><Counter source={a} name="a" /></Suspense>
      <Suspense fallback={<i>b loading</i>}><Counter source={b} name="b" /></Suspense>
    </div>
  )
}

function Id({ source, name }: { source: Promise<string>; name: string }) {
  return <b id={name} data-useid={useId()}>{use(source)}</b>
}

function Identified({ a, b }: { a: Promise<string>; b: Promise<string> }) {
  return (
    <div id="root" data-useid={useId()}>
      <Suspense fallback={<i>a loading</i>}><Id source={a} name="a" /></Suspense>
      <Suspense fallback={<i>b loading</i>}><Id source={b} name="b" /></Suspense>
    </div>
  )
}

// Resolves `before` ahead of the first read and `after` once the shell is read.
async function readAround(element: ReactNode, before: (value: string) => void, after: (value: string) => void) {
  const stream = await renderToReadableStream(element)
  before('A')
  await tick()
  const reader = stream.getReader(), decoder = new TextDecoder()
  const shell = decoder.decode((await reader.read()).value)
  after('B')
  let tail = ''
  for (;;) {
    const next = await reader.read()
    if (next.done) break
    tail += decoder.decode(next.value)
  }
  return { shell, tail }
}

// What a browser shows with JavaScript disabled: no reveal script runs.
function withoutScripts(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('SSR inlines boundaries completed before they are written', () => {
  it('inlines a boundary that resolved before the destination started reading', async () => {
    const data = deferred<string>()
    const stream = await renderToReadableStream(
      <main><Suspense fallback={<i>loading</i>}><Read source={data.promise} id="a" /></Suspense></main>,
    )
    data.resolve('ready')
    await tick()
    expect(await new Response(stream).text()).toBe('<main><!--$0--><section id="a">ready</section><!--/$--></main>')
  })

  it('writes a fully inline document when the reader waits for allReady', async () => {
    const outer = deferred<string>(), inner = deferred<string>()
    function Outer() {
      const value = use(outer.promise)
      return (
        <div data-remote="a">
          {value}
          <Suspense fallback={<i>inner loading</i>}><Read source={inner.promise} id="inner" /></Suspense>
        </div>
      )
    }
    const app = (
      <html><head /><body>
        <div data-boundary="remote-a"><Suspense fallback={<i>outer loading</i>}><Outer /></Suspense></div>
      </body></html>
    )
    setTimeout(() => outer.resolve('outer'), 1)
    setTimeout(() => inner.resolve('inner'), 3)

    const stream = await renderToReadableStream(app)
    await stream.allReady
    const readable = await new Response(stream).text()
    const piped = await pipe(app)

    for (const html of [readable, piped]) {
      expect(html).not.toMatch(/<script|<!--\$\?|id="[BS]:/)
      const page = withoutScripts(html)
      expect(page.querySelector('[data-boundary="remote-a"] [data-remote="a"] #inner')?.textContent).toBe('inner')
      expect(page.body.textContent).not.toContain('loading')
    }
    expect(piped).toBe(readable)
  })

  it('outlines only boundaries still pending at the write and hydrates both kinds', async () => {
    const early = deferred<string>(), late = deferred<string>()
    const { shell, tail } = await readAround(<Counters a={early.promise} b={late.promise} />, early.resolve, late.resolve)

    // A completed before the write: inline, never outlined or revealed.
    expect(shell).toContain('<!--$0--><button id="a">A<!-- -->:<!-- -->0</button><!--/$-->')
    expect(shell).toContain('<!--$?1--><div id="B:1"><i>b loading</i></div><!--/$-->')
    expect(shell + tail).not.toContain('S:0')
    expect(tail).toContain('<div hidden id="S:1"><button id="b">B<!-- -->:<!-- -->0</button></div>')
    expect(tail).toContain('$RC(1)')

    const container = document.createElement('div')
    container.innerHTML = shell + tail
    document.body.appendChild(container)
    for (const script of Array.from(container.querySelectorAll('script'))) new Function(script.textContent ?? '')()
    const a = container.querySelector('#a') as HTMLButtonElement, b = container.querySelector('#b') as HTMLButtonElement
    const onRecoverableError = vi.fn()
    hydrateRoot(container, <Counters a={settled('A')} b={settled('B')} />, { onRecoverableError })
    await tick()

    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(container.querySelector('#a')).toBe(a)
    expect(container.querySelector('#b')).toBe(b)
    flushSync(() => a.click())
    flushSync(() => b.click())
    expect(a.textContent).toBe('A:1')
    expect(b.textContent).toBe('B:1')
    container.remove()
  })

  it('keeps the useId values of an outlined write when inlining', async () => {
    const ids = async (resolveBeforeRead: boolean) => {
      const early = deferred<string>(), late = deferred<string>()
      const { shell, tail } = await readAround(
        <Identified a={early.promise} b={late.promise} />,
        resolveBeforeRead ? early.resolve : () => {},
        () => { early.resolve('A'); late.resolve('B') },
      )
      const container = document.createElement('div')
      container.innerHTML = shell + tail
      for (const script of Array.from(container.querySelectorAll('script'))) new Function(script.textContent ?? '')()
      return Array.from(container.querySelectorAll('[data-useid]'), node => `${node.id}=${node.getAttribute('data-useid')}`)
    }
    const mixed = await ids(true), outlined = await ids(false)
    expect(mixed).toHaveLength(3)
    expect(mixed).toEqual(outlined)
  })

  it('writes a boundary that failed before the write as client-rendered without a script', async () => {
    const data = deferred<string>(), failure = new Error('boundary failed')
    const onError = vi.fn()
    const stream = await renderToReadableStream(
      <main><Suspense fallback={<i>fallback</i>}><Read source={data.promise} id="a" /></Suspense></main>,
      { onError },
    )
    data.reject(failure)
    await stream.allReady
    expect(await new Response(stream).text()).toBe('<main><!--$E0--><i>fallback</i><!--/$--></main>')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(failure)
  })

  it('puts stylesheets of boundaries completed before the write in the head', async () => {
    const data = deferred<string>()
    function Styled() {
      const value = use(data.promise)
      preinit('/boundary.css', { as: 'style', precedence: 'theme' })
      return <p>{value}</p>
    }
    const stream = await renderToReadableStream(
      <html><head /><body><Suspense fallback={<i>loading</i>}><Styled /></Suspense></body></html>,
    )
    data.resolve('styled')
    await stream.allReady
    const html = await new Response(stream).text()
    expect(html).toBe(
      '<!DOCTYPE html><html><head><link rel="stylesheet" href="/boundary.css" data-precedence="theme"/></head>' +
      '<body><!--$0--><p>styled</p><!--/$--></body></html>',
    )
  })

  it('drops boundaries inside a fallback that was replaced before the write', async () => {
    const content = deferred<string>(), fallback = deferred<string>()
    const stream = await renderToReadableStream(
      <main>
        <Suspense fallback={<Suspense fallback={<i>wait</i>}><Read source={fallback.promise} id="fallback" /></Suspense>}>
          <Read source={content.promise} id="content" />
        </Suspense>
      </main>,
    )
    content.resolve('content')
    await tick()
    fallback.resolve('fallback')
    await stream.allReady
    expect(await new Response(stream).text()).toBe('<main><!--$0--><section id="content">content</section><!--/$--></main>')
  })
})

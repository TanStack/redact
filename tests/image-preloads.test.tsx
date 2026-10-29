import { describe, expect, it, vi } from 'vitest'
import { preload } from 'react-dom'
import { hydrateRoot } from 'react-dom/client'
import { renderToReadableStream, renderToString } from 'react-dom/server'

type Attributes = Record<string, string>
function tags(html: string): Attributes[] {
  return Array.from(html.matchAll(/<(link|meta|title)\b([^>]*)>/g), ([, tag, source]) => ({
    tag: tag!,
    ...Object.fromEntries(Array.from(source!.matchAll(/([\w-]+)="([^"]*)"/g), ([, name, value]) => [name!.toLowerCase(), value!])),
  }))
}
const head = (html: string) => tags(html.slice(html.indexOf('<head>'), html.indexOf('</head>')))

function Page({ children }: { children?: any }) {
  return (
    <html>
      <head>
        <link rel="stylesheet" href="/app.css" precedence="default" />
        <title>page</title>
        <meta name="viewport" content="width=device-width" />
        <meta charSet="utf-8" />
        <meta name="description" content="stays in place" />
      </head>
      <body>{children}</body>
    </html>
  )
}

const images = (
  <>
    <img src="/hero.png" fetchPriority="high" alt="" />
    <img src="/plain.png" alt="" />
    <img src="/plain.png" alt="again" />
    <img src="/fallback.png" srcSet="/small.png 1x, /large.png 2x" sizes="100vw" crossOrigin="anonymous" alt="" />
    <img src="/lazy.png" loading="lazy" alt="" />
    <img src="/low.png" fetchPriority="low" alt="" />
    <img src="data:image/png;base64,AAAA" alt="" />
    <img src="" alt="" />
    <picture><source srcSet="/picture.webp" type="image/webp" /><img src="/picture.png" alt="" /></picture>
    <noscript><img src="/noscript.png" alt="" /></noscript>
    <svg><image href="/vector.png" /></svg>
  </>
)

const expectedHead = [
  { tag: 'meta', charset: 'utf-8' },
  { tag: 'meta', name: 'viewport', content: 'width=device-width' },
  { tag: 'link', rel: 'preload', as: 'image', href: '/hero.png', fetchpriority: 'high' },
  { tag: 'link', rel: 'preload', as: 'image', href: '/plain.png' },
  { tag: 'link', rel: 'preload', as: 'image', imagesrcset: '/small.png 1x, /large.png 2x', imagesizes: '100vw', crossorigin: 'anonymous' },
  { tag: 'link', rel: 'stylesheet', href: '/app.css', 'data-precedence': 'default' },
  { tag: 'title' },
  { tag: 'meta', name: 'description', content: 'stays in place' },
]

async function streamed(element: any) {
  const stream = await renderToReadableStream(element)
  await stream.allReady
  return new Response(stream).text()
}

describe('image preloads', () => {
  it('preloads eagerly rendered images and opens the head with charset and viewport', () => {
    const html = renderToString(<Page>{images}</Page>)
    expect(head(html)).toEqual(expectedHead)
    // The images themselves still render where they are.
    expect(html.match(/<img\b/g)).toHaveLength(10)
    expect(html).toContain('<meta name="description" content="stays in place"/></head>')
  })

  it('streams the same head', async () => {
    expect(head(await streamed(<Page>{images}</Page>))).toEqual(expectedHead)
  })

  it('sends the first ten image preloads ahead of the stylesheets and the rest after the scripts', () => {
    const html = renderToString(
      <Page>
        {Array.from({ length: 12 }, (_, index) => <img key={index} src={`/${index}.png`} alt="" />)}
        <img src="/late-hero.png" fetchPriority="high" alt="" />
      </Page>,
    )
    const links = head(html).filter(link => link.rel !== undefined)
    expect(links.map(link => link.href ?? link.rel)).toEqual([
      ...Array.from({ length: 10 }, (_, index) => `/${index}.png`),
      '/late-hero.png',
      '/app.css',
      '/10.png',
      '/11.png',
    ])
  })

  it('shares one preload with an explicit preload() of the same image', () => {
    function App() {
      preload('/explicit.png', { as: 'image' })
      preload('/high.png', { as: 'image', fetchPriority: 'high' })
      return <><img src="/explicit.png" alt="" /><img src="/high.png" alt="" /><img src="/other.png" alt="" /></>
    }
    const links = head(renderToString(<Page><App /></Page>)).filter(link => link.rel !== undefined)
    // The explicit preload moves ahead of the stylesheet once its image renders, keeping its own attributes.
    expect(links).toEqual([
      { tag: 'link', rel: 'preload', as: 'image', href: '/high.png', fetchpriority: 'high' },
      { tag: 'link', rel: 'preload', as: 'image', href: '/explicit.png' },
      { tag: 'link', rel: 'preload', as: 'image', href: '/other.png' },
      { tag: 'link', rel: 'stylesheet', href: '/app.css', 'data-precedence': 'default' },
    ])
  })

  it('leaves fragment renders alone, whose root-container hydration is positional', () => {
    const html = renderToString(<><p>intro</p><meta charSet="utf-8" /><img src="/inline.png" alt="" /></>)
    expect(html).toBe('<p>intro</p><meta charset="utf-8"/><img src="/inline.png" alt=""/>')
  })

  it('leaves a fragment that renders its own head alone', () => {
    const html = renderToString(<><head><meta charSet="utf-8" /></head><img src="/inline.png" alt="" /></>)
    expect(html).toBe('<head><meta charset="utf-8"/></head><img src="/inline.png" alt=""/>')
  })

  it('synthesises the head of an html tree that omits it', () => {
    const html = renderToString(<html><body><img src="/hero.png" fetchPriority="high" alt="" /></body></html>)
    expect(html).toBe('<!DOCTYPE html><html><head><link rel="preload" href="/hero.png" as="image" fetchpriority="high"/></head><body><img src="/hero.png" fetchpriority="high" alt=""/></body></html>')
  })

  it('keeps itemProp metas and metas inside noscript where they are', () => {
    const html = renderToString(<Page><meta itemProp="name" content="item" /><noscript><meta charSet="latin1" /></noscript></Page>)
    expect(html).toContain('<body><meta itemprop="name" content="item"/><noscript><meta charset="latin1"/></noscript></body>')
    expect(head(html).filter(tag => tag.charset)).toEqual([{ tag: 'meta', charset: 'utf-8' }])
  })

  it('drops the metas of a boundary that suspends and keeps its preload', async () => {
    let resolve!: () => void
    const ready = new Promise<void>(next => { resolve = next })
    let done = false
    function Late() {
      if (!done) throw ready.then(() => { done = true })
      return <p>late</p>
    }
    const { Suspense } = await import('react')
    const stream = await renderToReadableStream(
      <Page>
        <Suspense fallback={<p>loading</p>}>
          <meta name="viewport" content="late" />
          <img src="/late.png" alt="" />
          <Late />
        </Suspense>
      </Page>,
    )
    resolve()
    await stream.allReady
    const html = await new Response(stream).text()
    // The shell keeps only the head's viewport; the boundary's meta arrives in place with its content.
    expect(html.match(/<meta name="viewport"/g)).toHaveLength(2)
    expect(head(html).filter(tag => tag.name === 'viewport')).toEqual([{ tag: 'meta', name: 'viewport', content: 'width=device-width' }])
    expect(html).toContain('<meta name="viewport" content="late"/><img src="/late.png" alt=""/><p>late</p>')
    // The preload registered by the discarded attempt stays in the shell and is not repeated.
    expect(html.match(/rel="preload" href="\/late.png"/g)).toHaveLength(1)
    expect(head(html).some(tag => tag.href === '/late.png')).toBe(true)
  })

  it('keeps excluding the images of a picture whose boundary streams later', async () => {
    let resolve!: () => void
    const ready = new Promise<void>(next => { resolve = next })
    let done = false
    function Late() {
      if (!done) throw ready.then(() => { done = true })
      return <img src="/late.png" alt="" />
    }
    const { Suspense } = await import('react')
    const stream = await renderToReadableStream(
      <Page><picture><source srcSet="/late.webp" type="image/webp" /><Suspense fallback={null}><Late /></Suspense></picture></Page>,
    )
    resolve()
    await stream.allReady
    const html = await new Response(stream).text()
    expect(html).toContain('<img src="/late.png" alt=""/>')
    expect(html).not.toContain('rel="preload" href="/late.png"')
  })

  it('omits the charset and viewport metas of a fallback and preloads its images', async () => {
    let resolve!: () => void
    const ready = new Promise<void>(next => { resolve = next })
    let done = false
    function Late() {
      if (!done) throw ready.then(() => { done = true })
      return <p>late</p>
    }
    const { Suspense } = await import('react')
    const fallback = <><meta name="viewport" content="fallback" /><meta name="robots" content="noindex" /><img src="/fallback.png" alt="" /></>
    const stream = await renderToReadableStream(<Page><Suspense fallback={fallback}><Late /></Suspense></Page>)
    resolve()
    await stream.allReady
    const html = await new Response(stream).text()
    expect(html).not.toContain('content="fallback"')
    expect(html).toContain('<meta name="robots" content="noindex"/><img src="/fallback.png" alt=""/>')
    expect(head(html).filter(tag => tag.name === 'viewport')).toEqual([{ tag: 'meta', name: 'viewport', content: 'width=device-width' }])
    expect(head(html).some(tag => tag.href === '/fallback.png')).toBe(true)
  })

  it('renders the preloads of a boundary that streams later with its content', async () => {
    let resolve!: () => void
    const ready = new Promise<void>(next => { resolve = next })
    let done = false
    function Late() {
      if (!done) throw ready.then(() => { done = true })
      return <><meta name="viewport" content="late" /><img src="/late.png" alt="" /></>
    }
    const { Suspense } = await import('react')
    const stream = await renderToReadableStream(<Page><Suspense fallback={<p>loading</p>}><Late /></Suspense></Page>)
    resolve()
    await stream.allReady
    const html = await new Response(stream).text()
    expect(head(html).filter(tag => tag.name === 'viewport')).toEqual([{ tag: 'meta', name: 'viewport', content: 'width=device-width' }])
    const body = html.slice(html.indexOf('<body>'))
    expect(body).toContain('<link rel="preload" href="/late.png" as="image"/>')
    expect(body).toContain('<meta name="viewport" content="late"/><img src="/late.png" alt=""/>')
  })

  it('emits the metas of a retried shell once', async () => {
    let value: string | undefined
    const pending = Promise.resolve('ready').then(result => { value = result })
    function Late() {
      // Suspends outside any boundary after the head was walked, so the shell is rendered twice.
      if (value === undefined) throw pending
      return <p>{value}</p>
    }
    const html = await streamed(<Page><img src="/hero.png" alt="" /><Late /></Page>)
    expect(head(html)).toEqual([expectedHead[0], expectedHead[1], { tag: 'link', rel: 'preload', as: 'image', href: '/hero.png' }, ...expectedHead.slice(5)])
    expect(html).toContain('<p>ready</p>')
  })

  it('hydrates the reordered head without recoverable errors', () => {
    const html = renderToString(<Page>{images}</Page>)
    const doc = new (globalThis as any).DOMParser().parseFromString('<!doctype html>' + html, 'text/html') as Document
    const onRecoverableError = vi.fn()
    const errors: unknown[] = []
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args) })
    try {
      hydrateRoot(doc as any, <Page>{images}</Page>, { onRecoverableError })
    } finally {
      consoleError.mockRestore()
    }
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(errors).toEqual([])
    expect(doc.querySelectorAll('link[rel="preload"][as="image"]')).toHaveLength(3)
    expect(doc.querySelector('meta[charset]')).toBe(doc.head.firstElementChild)
    expect(doc.querySelectorAll('img')).toHaveLength(10)
  })
})

// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Suspense, use } from 'react'
import { preconnect, prefetchDNS, preinit, preinitModule, preload, preloadModule } from 'react-dom'
import { renderToString, renderToStaticMarkup, renderToReadableStream } from 'react-dom/server'

type Attributes = Record<string, string>
function hints(output: string): Attributes[] {
  const decode = (value: string) => value.replace(/&(quot|amp|lt|gt|#x27);/g, (_, entity: string) => ({ quot: '"', amp: '&', lt: '<', gt: '>', '#x27': "'" })[entity]!)
  return Array.from(output.matchAll(/<(link|script)\b([^>]*)>/g), ([, tag, source]) => {
    const attrs = Object.fromEntries(Array.from(source!.matchAll(/([\w-]+)="([^"]*)"/g), ([, name, value]) => [name!.toLowerCase(), decode(value!)]))
    return tag === 'script' && !attrs.src ? null : attrs
  }).filter((value): value is Attributes => value !== null)
}

function App({ run }: { run: () => void }) {
  run()
  return <p>body</p>
}
const html = (run: () => void) => renderToString(<App run={run} />)

async function readable(run: () => void) {
  const stream = await renderToReadableStream(<App run={run} />)
  await stream.allReady
  return new Response(stream).text()
}

describe('server resource hints', () => {
  it('emits resource groups ahead of fragment content in React order', () => {
    const output = html(() => {
      preload('/script.js', { as: 'script' })
      preinit('/theme.css', { as: 'style', precedence: 'theme' })
      preload('/font.woff2', { as: 'font' })
      preload('/photo.png', { as: 'image', fetchPriority: 'high' })
      preconnect('https://cdn.test')
      prefetchDNS('https://api.test')
      preinit('/run.js', { as: 'script' })
      preloadModule('/module.js')
    })
    expect(hints(output)).toEqual([
      { rel: 'preconnect', href: 'https://cdn.test' },
      { rel: 'dns-prefetch', href: 'https://api.test' },
      { rel: 'preload', href: '/font.woff2', as: 'font', crossorigin: '' },
      { rel: 'preload', href: '/photo.png', as: 'image', fetchpriority: 'high' },
      { rel: 'stylesheet', href: '/theme.css', 'data-precedence': 'theme' },
      { src: '/run.js', async: '' },
      { rel: 'preload', href: '/script.js', as: 'script' },
      { rel: 'modulepreload', href: '/module.js' },
    ])
    expect(output.endsWith('<p>body</p>')).toBe(true)
  })

  it('has the same hint content for static, string and readable rendering', async () => {
    const run = () => {
      prefetchDNS('https://api.test')
      preload('/data', { as: 'fetch', crossOrigin: 'anonymous', integrity: 'sha256-data', nonce: 'secret', referrerPolicy: 'no-referrer', fetchPriority: 'low', type: 'application/json', media: 'screen' } as any)
      preinitModule('/module.js', { nonce: 'script-nonce' })
    }
    const expected = hints(html(run))
    expect(expected).toHaveLength(3)
    expect(hints(renderToStaticMarkup(<App run={run} />))).toEqual(expected)
    expect(hints(await readable(run))).toEqual(expected)
  })

  it('deduplicates within each request but not across requests', () => {
    const run = () => {
      preconnect('https://cdn.test')
      preconnect('https://cdn.test')
      preload('/image.png', { as: 'image' })
      preload('/image.png', { as: 'image', fetchPriority: 'high' })
      preinit('/script.js', { as: 'script' })
      preinit('/script.js', { as: 'script' })
    }
    const first = html(run), second = html(run)
    expect(hints(first)).toHaveLength(3)
    expect(second).toBe(first)
  })

  it('keeps anonymous, credentialed and unspecified connection modes separate', () => {
    const output = html(() => {
      preconnect('https://cdn.test')
      preconnect('https://cdn.test', { crossOrigin: 'anonymous' })
      preconnect('https://cdn.test', { crossOrigin: 'use-credentials' })
      preconnect('https://cdn.test', { crossOrigin: 'anonymous' })
    })
    expect(hints(output).map(node => node.crossorigin)).toEqual([undefined, '', 'use-credentials'])
  })

  it('replaces unflushed style and script preloads with initialized resources', () => {
    const output = html(() => {
      preload('/style.css', { as: 'style', crossOrigin: 'use-credentials', integrity: 'style-first', referrerPolicy: 'no-referrer', nonce: 'ignored' })
      preinit('/style.css', { as: 'style' })
      preload('/script.js', { as: 'script', crossOrigin: 'use-credentials', integrity: 'script-first', referrerPolicy: 'no-referrer', nonce: 'ignored' })
      preinit('/script.js', { as: 'script' })
      preloadModule('/module.js', { crossOrigin: 'use-credentials', integrity: 'module-first', nonce: 'ignored' })
      preinitModule('/module.js')
    })
    expect(hints(output)).toEqual([
      { rel: 'stylesheet', href: '/style.css', 'data-precedence': 'default', crossorigin: 'use-credentials', integrity: 'style-first' },
      { src: '/script.js', async: '', crossorigin: 'use-credentials', integrity: 'script-first' },
      { src: '/module.js', type: 'module', async: '', crossorigin: 'use-credentials', integrity: 'module-first' },
    ])
  })

  it('retains explicit preinit options instead of replacing them with preload options', () => {
    const output = html(() => {
      preload('/script.js', { as: 'script', crossOrigin: 'use-credentials', integrity: 'preload' })
      preinit('/script.js', { as: 'script', crossOrigin: 'anonymous', integrity: 'init', nonce: 'secret', fetchPriority: 'high' })
    })
    expect(hints(output)).toEqual([{ src: '/script.js', async: '', crossorigin: '', integrity: 'init', nonce: 'secret', fetchpriority: 'high' }])
  })

  it('deduplicates classic and module resources separately on the server', () => {
    const output = html(() => {
      preload('/same.js', { as: 'script' })
      preloadModule('/same.js')
      preinit('/run.js', { as: 'script' })
      preinitModule('/run.js')
    })
    expect(hints(output)).toEqual([
      { src: '/run.js', async: '' },
      { src: '/run.js', type: 'module', async: '' },
      { rel: 'preload', href: '/same.js', as: 'script' },
      { rel: 'modulepreload', href: '/same.js' },
    ])
  })

  it('suppresses preloads issued after matching preinitialization', () => {
    const output = html(() => {
      preinit('/theme.css', { as: 'style' })
      preload('/theme.css', { as: 'style' })
      preinit('/run.js', { as: 'script' })
      preload('/run.js', { as: 'script' })
      preinitModule('/module.js')
      preloadModule('/module.js')
    })
    expect(hints(output)).toHaveLength(3)
    expect(hints(output).some(node => node.rel === 'preload' || node.rel === 'modulepreload')).toBe(false)
  })

  it('groups stylesheet precedence in first-seen order', () => {
    const output = html(() => {
      preinit('/high-1.css', { as: 'style', precedence: 'high' })
      preinit('/low.css', { as: 'style', precedence: 'low' })
      preinit('/high-2.css', { as: 'style', precedence: 'high' })
    })
    expect(hints(output).map(node => node.href)).toEqual(['/high-1.css', '/high-2.css', '/low.css'])
  })

  it('uses responsive source-set identity instead of the fallback href', () => {
    const output = html(() => {
      preload('/one.png', { as: 'image', imageSrcSet: '/small.png 1x, /large.png 2x', imageSizes: '100vw' })
      preload('/two.png', { as: 'image', imageSrcSet: '/small.png 1x, /large.png 2x', imageSizes: '100vw' })
      preload('/three.png', { as: 'image', imageSrcSet: '/small.png 1x, /large.png 2x', imageSizes: '50vw' })
    })
    expect(hints(output)).toEqual([
      { rel: 'preload', as: 'image', imagesrcset: '/small.png 1x, /large.png 2x', imagesizes: '100vw' },
      { rel: 'preload', as: 'image', imagesrcset: '/small.png 1x, /large.png 2x', imagesizes: '50vw' },
    ])
  })

  it('escapes URL and option values without creating extra markup', () => {
    const href = '/file?q="&<>\''
    const nonce = '"><script>unexpected()</script>'
    const output = html(() => preload(href, { as: 'fetch', nonce }))
    expect(hints(output)).toEqual([{ rel: 'preload', href, as: 'fetch', nonce }])
    expect(output).not.toContain('<script>unexpected()')
    expect(output).toContain('&quot;')
    expect(output).toContain('&lt;')
  })

  it('places hints inside a full-document head, even when discovered in the body', async () => {
    function Child() {
      preload('/data', { as: 'fetch' })
      return <p>body</p>
    }
    const tree = <html><head><title>test</title></head><body><Child /></body></html>
    for (const output of [renderToString(tree), renderToStaticMarkup(tree), await new Response(await renderToReadableStream(tree)).text()]) {
      expect(output.indexOf('<link')).toBeGreaterThan(output.indexOf('<head>'))
      expect(output.indexOf('<link')).toBeLessThan(output.indexOf('</head>'))
      expect(hints(output)).toEqual([{ rel: 'preload', href: '/data', as: 'fetch' }])
    }
  })

  it('ignores calls outside an active server render', () => {
    prefetchDNS('https://outside.test')
    preconnect('https://outside.test')
    preload('/outside', { as: 'fetch' })
    preinit('/outside.js', { as: 'script' })
    preloadModule('/outside-module.js')
    preinitModule('/outside-init.js')
    expect(hints(renderToString(<p>body</p>))).toEqual([])
  })

  it('emits late hints before boundary output, with late styles only preloaded', async () => {
    let resolve!: () => void
    const pending = new Promise<void>(done => { resolve = done })
    function Child() {
      use(pending)
      preinit('/late.css', { as: 'style', precedence: 'theme' })
      preinit('/late.js', { as: 'script' })
      preload('/late.json', { as: 'fetch' })
      return <p>ready</p>
    }
    const stream = await renderToReadableStream(<div><b>shell</b><Suspense fallback={<i>loading</i>}><Child /></Suspense></div>)
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    const shell = decoder.decode((await reader.read()).value)
    expect(hints(shell)).toEqual([])
    resolve()
    let tail = ''
    while (true) {
      const result = await reader.read()
      if (result.done) break
      tail += decoder.decode(result.value)
    }
    expect(hints(tail)).toEqual([
      { rel: 'preload', as: 'style', href: '/late.css' },
      { src: '/late.js', async: '' },
      { rel: 'preload', href: '/late.json', as: 'fetch' },
    ])
    expect(tail.indexOf('/late.json')).toBeLessThan(tail.indexOf('<p>ready</p>'))
  })

  it('keeps interleaved readable requests isolated', async () => {
    let finishFirst!: () => void, finishSecond!: () => void
    const first = new Promise<void>(resolve => { finishFirst = resolve })
    const second = new Promise<void>(resolve => { finishSecond = resolve })
    function Child({ pending, href }: { pending: Promise<void>; href: string }) {
      use(pending)
      preload(href, { as: 'fetch' })
      return <p>{href}</p>
    }
    const firstStream = await renderToReadableStream(<div><Suspense fallback="wait"><Child pending={first} href="/first" /></Suspense></div>)
    const secondStream = await renderToReadableStream(<div><Suspense fallback="wait"><Child pending={second} href="/second" /></Suspense></div>)
    const firstOutput = new Response(firstStream).text(), secondOutput = new Response(secondStream).text()
    finishSecond()
    expect(hints(await secondOutput)).toEqual([{ rel: 'preload', href: '/second', as: 'fetch' }])
    finishFirst()
    expect(hints(await firstOutput)).toEqual([{ rel: 'preload', href: '/first', as: 'fetch' }])
  })

  it('restores the outer resource request after nested renderToString', () => {
    let inner = ''
    const outer = html(() => {
      preload('/outer-before', { as: 'fetch' })
      inner = html(() => preload('/inner', { as: 'fetch' }))
      preload('/outer-after', { as: 'fetch' })
    })
    expect(hints(inner)).toEqual([{ rel: 'preload', href: '/inner', as: 'fetch' }])
    expect(hints(outer)).toEqual([
      { rel: 'preload', href: '/outer-before', as: 'fetch' },
      { rel: 'preload', href: '/outer-after', as: 'fetch' },
    ])
  })

  it('cleans up a failed render without leaking its hints into later requests', () => {
    expect(() => html(() => { preload('/failed', { as: 'fetch' }); throw new Error('failed render') })).toThrow('failed render')
    preload('/outside', { as: 'fetch' })
    expect(hints(html(() => preload('/next', { as: 'fetch' })))).toEqual([{ rel: 'preload', href: '/next', as: 'fetch' }])
  })

  it('retains hints discovered by a primary tree that suspends before the shell', async () => {
    let resolve!: () => void
    const pending = new Promise<void>(done => { resolve = done })
    function Child() {
      preinit('/pending.css', { as: 'style', precedence: 'theme' })
      preload('/pending.json', { as: 'fetch' })
      use(pending)
      return <p>ready</p>
    }
    const stream = await renderToReadableStream(<div><Suspense fallback={<i>loading</i>}><Child /></Suspense></div>)
    const reader = stream.getReader(), decoder = new TextDecoder()
    const shell = decoder.decode((await reader.read()).value)
    expect(hints(shell)).toEqual([
      { rel: 'stylesheet', href: '/pending.css', 'data-precedence': 'theme' },
      { rel: 'preload', href: '/pending.json', as: 'fetch' },
    ])
    resolve()
    let tail = ''
    while (true) {
      const next = await reader.read()
      if (next.done) break
      tail += decoder.decode(next.value)
    }
    expect(tail).toContain('<p>ready</p>')
    expect(hints(tail)).toEqual([])
  })

  it('retains early hints across a root-level suspension retry', async () => {
    let resolve!: () => void, attempt!: () => void
    const pending = new Promise<void>(done => { resolve = done })
    const attempted = new Promise<void>(done => { attempt = done })
    let ready = false
    function Child() {
      if (!ready) {
        preload('/early', { as: 'fetch' })
        preinit('/early.css', { as: 'style' })
        attempt()
        throw pending
      }
      preload('/ready', { as: 'fetch' })
      return <p>ready</p>
    }
    const result = renderToReadableStream(<Child />)
    await attempted
    ready = true
    resolve()
    const output = await new Response(await result).text()
    expect(hints(output)).toEqual([
      { rel: 'stylesheet', href: '/early.css', 'data-precedence': 'default' },
      { rel: 'preload', href: '/early', as: 'fetch' },
      { rel: 'preload', href: '/ready', as: 'fetch' },
    ])
  })

  it('does not leak a cancelled readable request into subsequent renders', async () => {
    const controller = new AbortController()
    const pending = new Promise<void>(() => {})
    function Child() {
      preload('/cancelled', { as: 'fetch' })
      use(pending)
      return null
    }
    const stream = await renderToReadableStream(<div><Suspense fallback="wait"><Child /></Suspense></div>, { signal: controller.signal, onError: vi.fn() })
    const output = new Response(stream).text()
    controller.abort(new Error('cancelled'))
    await output
    expect(hints(html(() => preload('/next', { as: 'fetch' })))).toEqual([{ rel: 'preload', href: '/next', as: 'fetch' }])
  })

  it('shares API and declarative resources in the same server request', () => {
    function Child() {
      preinit('/shared.css', { as: 'style', precedence: 'theme' })
      preinit('/shared.js', { as: 'script', nonce: 'secret' })
      return <><link rel="stylesheet" href="/shared.css" precedence="theme" /><script src="/shared.js" async /><p>body</p></>
    }
    const output = renderToString(<Child />)
    expect(hints(output)).toEqual([
      { rel: 'stylesheet', href: '/shared.css', 'data-precedence': 'theme' },
      { src: '/shared.js', async: '', nonce: 'secret' },
    ])
    expect(output.endsWith('<p>body</p>')).toBe(true)
  })

  it('replaces API preloads with declarative resources and adopts server credentials', () => {
    function Child() {
      preload('/adopt.css', { as: 'style', crossOrigin: 'use-credentials', integrity: 'style-integrity' })
      preload('/adopt.js', { as: 'script', crossOrigin: 'use-credentials', integrity: 'script-integrity', referrerPolicy: 'no-referrer' })
      return <><link rel="stylesheet" href="/adopt.css" precedence="theme" /><script src="/adopt.js" async /><p>body</p></>
    }
    expect(hints(renderToString(<Child />))).toEqual([
      { rel: 'stylesheet', href: '/adopt.css', 'data-precedence': 'theme', crossorigin: 'use-credentials', integrity: 'style-integrity' },
      { src: '/adopt.js', async: '', crossorigin: 'use-credentials', integrity: 'script-integrity' },
    ])
  })

  it('deduplicates repeated declarative async scripts without calling refs on the server', () => {
    const ref = vi.fn()
    const output = renderToString(<><script src="/duplicate.js" async ref={ref} /><script src="/duplicate.js" async /><p>body</p></>)
    expect(hints(output)).toEqual([{ src: '/duplicate.js', async: '' }])
    expect(ref).not.toHaveBeenCalled()
  })

  it('groups inline style rules with the same precedence and removes duplicate hrefs', () => {
    const output = renderToString(<><style href="/one" precedence="theme">{'a{}'}</style><style href="/two" precedence="theme">{'b{}'}</style><style href="/one" precedence="theme">ignored</style><p>body</p></>)
    expect(output).toBe('<style data-precedence="theme" data-href="/one /two">a{}b{}</style><p>body</p>')
  })

  it('places stylesheet links before inline rules in the same precedence group', () => {
    const output = renderToString(<><style href="/rules" precedence="theme">{'a{}'}</style><link rel="stylesheet" href="/theme.css" precedence="theme" /><p>body</p></>)
    expect(output).toBe('<link rel="stylesheet" href="/theme.css" data-precedence="theme"/><style data-precedence="theme" data-href="/rules">a{}</style><p>body</p>')
  })

  it('does not allow inline CSS text to break out of the style tag', () => {
    const output = renderToString(<style href="/unsafe" precedence="theme">{'a { content: "</style><script>unexpected()</script>" }'}</style>)
    expect(output).not.toContain('</style><script>')
    expect(output).toContain('data-href="/unsafe"')
  })

  it('ignores unsupported multiple style children instead of stringifying an array', () => {
    const output = renderToString(<style href="/array" precedence="theme">a{'{}'}</style>)
    expect(output).toBe('<style data-precedence="theme" data-href="/array"></style>')
  })

  it('does not apply unsupported nonce render options to either synchronous renderer', () => {
    const tree = <style href="/sync" precedence="theme">{'a{}'}</style>
    const expected = '<style data-precedence="theme" data-href="/sync">a{}</style>'
    for (const render of [renderToString, renderToStaticMarkup]) {
      expect(render(tree, { nonce: 'script' } as any)).toBe(expected)
      expect(render(tree, { nonce: { script: 'script', style: 'style' } } as any)).toBe(expected)
    }
  })

  it('uses a string streaming nonce only for scripts, not managed styles', async () => {
    const stream = await renderToReadableStream(<style href="/string" precedence="theme">{'a{}'}</style>, { nonce: 'script', bootstrapScriptContent: 'globalThis.ready=true' })
    const output = await new Response(stream).text()
    expect(output).toContain('<style data-precedence="theme" data-href="/string">a{}</style>')
    expect(output).toContain('<script nonce="script"')
    expect(output).not.toContain('<style nonce=')
  })

  it('uses the object style nonce for grouped rules and excludes mismatched rules', async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const nonce = 'style"&secret'
      const stream = await renderToReadableStream(<><style href="/allowed" precedence="theme" nonce={nonce}>{'a{}'}</style><style href="/second" precedence="theme" nonce={nonce}>{'b{}'}</style><style href="/wrong" precedence="theme" nonce="wrong">{'bad{}'}</style><style href="/absent" precedence="theme">{'missing{}'}</style><p>body</p></>, { nonce: { script: 'script', style: nonce } } as any)
      expect(await new Response(stream).text()).toBe('<style nonce="style&quot;&amp;secret" data-precedence="theme" data-href="/allowed /second">a{}b{}</style><p>body</p>')
    } finally { warning.mockRestore() }
  })

  it('preserves an empty precedence group when every inline rule has the wrong nonce', async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const stream = await renderToReadableStream(<><style href="/wrong" precedence="theme" nonce="wrong">{'bad{}'}</style><p>body</p></>, { nonce: { style: 'allowed' } } as any)
      expect(await new Response(stream).text()).toBe('<style nonce="allowed" data-precedence="theme"></style><p>body</p>')
      const withStylesheet = await renderToReadableStream(<><style href="/wrong" precedence="theme" nonce="wrong">{'bad{}'}</style><link rel="stylesheet" href="/theme.css" precedence="theme" /><p>body</p></>, { nonce: { style: 'allowed' } } as any)
      expect(await new Response(withStylesheet).text()).toBe('<link rel="stylesheet" href="/theme.css" data-precedence="theme"/><p>body</p>')
    } finally { warning.mockRestore() }
  })

  it('drops a style prop nonce without a render style nonce and preserves its rules', async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const tree = <style href="/props" precedence="theme" nonce="props">{'a{}'}</style>
      expect(await new Response(await renderToReadableStream(tree)).text()).toBe('<style data-precedence="theme" data-href="/props">a{}</style>')
      expect(await new Response(await renderToReadableStream(tree, { nonce: { style: '' } } as any)).text()).toBe('<style nonce="" data-precedence="theme" data-href="/props">a{}</style>')
    } finally { warning.mockRestore() }
  })

  it('retains the render style nonce on inert late rules but excludes mismatched rules', async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      let release!: () => void
      const pending = new Promise<void>(resolve => { release = resolve })
      function Child() {
        use(pending)
        return <><style href="/late-inline" precedence="theme" nonce="style">{'a{}'}</style><style href="/wrong" precedence="theme" nonce="wrong">{'bad{}'}</style><p>ready</p></>
      }
      const stream = await renderToReadableStream(<div><Suspense fallback="wait"><Child /></Suspense></div>, { nonce: { script: 'script', style: 'style' } } as any)
      const reader = stream.getReader(), decoder = new TextDecoder()
      await reader.read()
      release()
      let tail = ''
      while (true) {
        const next = await reader.read()
        if (next.done) break
        tail += decoder.decode(next.value)
      }
      expect(tail).toContain('<style nonce="style" media="not all" data-precedence="theme" data-href="/late-inline">a{}</style>')
      expect(tail).not.toContain('bad{}')
      expect(tail).not.toContain('/wrong')
      expect(tail).toContain('<script nonce="script"')
    } finally { warning.mockRestore() }
  })

  it('forwards only fetch attributes to late stylesheet preloads', async () => {
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    function Child() {
      use(pending)
      return <><link rel="stylesheet" href="/late.css" precedence="theme" id="actual-style" className="theme" hidden nonce="node" crossOrigin="anonymous" fetchPriority="high" integrity="sha256-css" media="screen" hrefLang="en" referrerPolicy="no-referrer" /><p>ready</p></>
    }
    const stream = await renderToReadableStream(<div><Suspense fallback="wait"><Child /></Suspense></div>)
    const reader = stream.getReader(), decoder = new TextDecoder()
    await reader.read()
    release()
    let tail = ''
    while (true) {
      const next = await reader.read()
      if (next.done) break
      tail += decoder.decode(next.value)
    }
    expect(hints(tail)).toEqual([{ rel: 'preload', as: 'style', href: '/late.css', crossorigin: 'anonymous', fetchpriority: 'high', integrity: 'sha256-css', media: 'screen', hreflang: 'en', referrerpolicy: 'no-referrer' }])
    expect(tail).toContain('["/late.css","theme",')
    expect(tail).toContain('"id","actual-style"')
    expect(tail).toContain('"class","theme"')
    expect(tail).toContain('"nonce","node"')
  })

  it('includes declarative styles in the shell when a later sibling suspends', async () => {
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    function Child() { use(pending); return <p>ready</p> }
    const stream = await renderToReadableStream(<div><Suspense fallback="waiting"><link rel="stylesheet" href="/pending.css" precedence="theme" /><style href="/pending-inline" precedence="theme">{'a{}'}</style><Child /></Suspense></div>)
    const reader = stream.getReader(), decoder = new TextDecoder()
    const shell = decoder.decode((await reader.read()).value)
    expect(hints(shell)).toEqual([{ rel: 'stylesheet', href: '/pending.css', 'data-precedence': 'theme' }])
    expect(shell).toContain('<style data-precedence="theme" data-href="/pending-inline">a{}</style>')
    release()
    while (!(await reader.read()).done) {}
  })

  it('does not attach a pending nested boundary stylesheet to its ready parent', async () => {
    let releaseOuter!: () => void, releaseInner!: () => void
    const outer = new Promise<void>(resolve => { releaseOuter = resolve })
    const inner = new Promise<void>(resolve => { releaseInner = resolve })
    function Wait() { use(inner); return <p>inner-ready</p> }
    function Outer() {
      use(outer)
      return <><p>outer-ready</p><Suspense fallback="inner-wait"><link rel="stylesheet" href="/nested.css" precedence="theme" /><style href="/nested-inline" precedence="theme">{'a{}'}</style><Wait /></Suspense></>
    }
    const stream = await renderToReadableStream(<div><Suspense fallback="outer-wait"><Outer /></Suspense></div>)
    const reader = stream.getReader(), decoder = new TextDecoder()
    await reader.read()
    releaseOuter()
    let outerTail = ''
    while (!outerTail.includes('outer-ready')) outerTail += decoder.decode((await reader.read()).value)
    expect(hints(outerTail)).toEqual([{ rel: 'preload', as: 'style', href: '/nested.css' }])
    expect(outerTail).not.toContain('["/nested.css",')
    expect(outerTail).not.toContain('data-href="/nested-inline"')
    releaseInner()
    let innerTail = ''
    while (true) {
      const next = await reader.read()
      if (next.done) break
      innerTail += decoder.decode(next.value)
    }
    expect(innerTail).toContain('inner-ready')
    expect(innerTail).toContain('media="not all" data-precedence="theme" data-href="/nested-inline"')
    expect(innerTail).toContain('["/nested.css",')
  })

  it('preloads styles from a failed late attempt but activates its resources only after retry succeeds', async () => {
    let releaseFirst!: () => void, releaseSecond!: () => void
    const first = new Promise<void>(resolve => { releaseFirst = resolve })
    const second = new Promise<void>(resolve => { releaseSecond = resolve })
    function Wait() { use(second); return <p>retry-ready</p> }
    function Child() {
      use(first)
      return <><link rel="stylesheet" href="/retry.css" precedence="theme" /><style href="/retry-inline" precedence="theme">{'a{}'}</style><Wait /></>
    }
    const stream = await renderToReadableStream(<div><Suspense fallback="wait"><Child /></Suspense></div>)
    const reader = stream.getReader(), decoder = new TextDecoder()
    expect(hints(decoder.decode((await reader.read()).value))).toEqual([])
    releaseFirst()
    let attempted = ''
    while (!attempted.includes('/retry.css')) attempted += decoder.decode((await reader.read()).value)
    expect(hints(attempted)).toEqual([{ rel: 'preload', as: 'style', href: '/retry.css' }])
    expect(attempted).not.toContain('data-href="/retry-inline"')
    expect(attempted).not.toContain('["/retry.css",')
    expect(attempted).not.toContain('retry-ready')
    releaseSecond()
    let ready = ''
    while (true) {
      const next = await reader.read()
      if (next.done) break
      ready += decoder.decode(next.value)
    }
    expect(hints(ready)).toEqual([])
    expect(ready).toContain('media="not all" data-precedence="theme" data-href="/retry-inline"')
    expect(ready).toContain('["/retry.css",')
    expect(ready).toContain('retry-ready')
  })

  it('flushes a ready inline precedence group including rules discovered by a pending nested boundary', async () => {
    let releaseOuter!: () => void, releaseInner!: () => void
    const outer = new Promise<void>(resolve => { releaseOuter = resolve })
    const inner = new Promise<void>(resolve => { releaseInner = resolve })
    function Wait() { use(inner); return <p>inner-ready</p> }
    function Outer() {
      use(outer)
      return <><style href="/outer-inline" precedence="theme">{'outer{}'}</style><p>outer-ready</p><Suspense fallback="inner-wait"><style href="/inner-inline" precedence="theme">{'inner{}'}</style><style href="/other-inline" precedence="other">{'other{}'}</style><Wait /></Suspense></>
    }
    const stream = await renderToReadableStream(<div><Suspense fallback="outer-wait"><Outer /></Suspense></div>)
    const reader = stream.getReader(), decoder = new TextDecoder()
    await reader.read()
    releaseOuter()
    let outerTail = ''
    while (!outerTail.includes('outer-ready')) outerTail += decoder.decode((await reader.read()).value)
    expect(outerTail).toContain('<style media="not all" data-precedence="theme" data-href="/outer-inline /inner-inline">outer{}inner{}</style>')
    expect(outerTail).not.toContain('/other-inline')
    releaseInner()
    let innerTail = ''
    while (true) {
      const next = await reader.read()
      if (next.done) break
      innerTail += decoder.decode(next.value)
    }
    expect(innerTail).toContain('inner-ready')
    expect(innerTail).not.toContain('/outer-inline')
    expect(innerTail).not.toContain('/inner-inline')
    expect(innerTail).toContain('<style media="not all" data-precedence="other" data-href="/other-inline">other{}</style>')
  })
})

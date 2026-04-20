import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { renderToString, renderToReadableStream } from 'react-dom/server'

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
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

describe('renderToString', () => {
  it('renders host element', () => {
    expect(renderToString(<div class="x">hi</div>)).toBe('<div class="x">hi</div>')
  })

  it('renders function component', () => {
    function Hello({ name }: { name: string }) {
      return <span>Hello, {name}!</span>
    }
    // Adjacent text children are separated by `<!-- -->` markers to preserve
    // React-tree boundaries across the browser's text-node merging.
    expect(renderToString(<Hello name="Tanner" />)).toBe(
      '<span>Hello, <!-- -->Tanner<!-- -->!</span>',
    )
  })

  it('escapes text and attrs', () => {
    expect(renderToString(<div title={'<a&b"c'}>{'<a&b'}</div>)).toBe(
      '<div title="&lt;a&amp;b&quot;c">&lt;a&amp;b</div>',
    )
  })

  it('renders boolean attrs', () => {
    const html = renderToString(<input type="checkbox" checked disabled />)
    expect(html).toContain('checked=""')
    expect(html).toContain('disabled=""')
  })

  it('renders void elements self-closing', () => {
    expect(renderToString(<img src="/a.png" alt="a" />)).toBe('<img src="/a.png" alt="a"/>')
  })

  it('renders context provider value', () => {
    const Ctx = React.createContext('default')
    function Reader() {
      return <span>{React.useContext(Ctx)}</span>
    }
    const html = renderToString(
      <Ctx.Provider value="real">
        <Reader />
      </Ctx.Provider>,
    )
    expect(html).toBe('<span>real</span>')
  })

  it('renders class component', () => {
    class C extends React.Component<{ x: number }, { y: number }> {
      state = { y: this.props.x * 2 }
      render() {
        return <span>{this.state.y}</span>
      }
    }
    expect(renderToString(<C x={3} />)).toBe('<span>6</span>')
  })

  it('renders style objects', () => {
    const html = renderToString(<div style={{ color: 'red', marginTop: 4 }} />)
    expect(html).toBe('<div style="color:red;margin-top:4px;"></div>')
  })

  it('skips event handlers', () => {
    expect(renderToString(<button onClick={() => {}}>x</button>)).toBe('<button>x</button>')
  })

  it('renders dangerouslySetInnerHTML', () => {
    expect(
      renderToString(
        <div dangerouslySetInnerHTML={{ __html: '<em>raw</em>' }} />,
      ),
    ).toBe('<div><em>raw</em></div>')
  })

  it('renders Fragment and arrays', () => {
    const html = renderToString(
      <>
        <span>a</span>
        {['b', 'c'].map((x) => (
          <span key={x}>{x}</span>
        ))}
      </>,
    )
    expect(html).toBe('<span>a</span><span>b</span><span>c</span>')
  })

  it('Suspense renders fallback when child suspends', () => {
    const promise = new Promise<string>(() => {})
    function Inner() {
      return <span>{React.use(promise)}</span>
    }
    const html = renderToString(
      <React.Suspense fallback={<i>load</i>}>
        <Inner />
      </React.Suspense>,
    )
    // Fallback is emitted inside the boundary marker
    expect(html).toContain('<i>load</i>')
  })
})

describe('renderToReadableStream', () => {
  it('streams shell with no suspense', async () => {
    const stream = await renderToReadableStream(<div>hello</div>)
    const out = await streamToString(stream)
    expect(out).toContain('<div>hello</div>')
    await stream.allReady
  })

  it('streams fallback then resolved content', async () => {
    let resolve: (v: string) => void
    const promise = new Promise<string>((r) => {
      resolve = r
    })
    function Inner() {
      return <span id="real">{React.use(promise)}</span>
    }
    const stream = await renderToReadableStream(
      <div>
        before
        <React.Suspense fallback={<i id="fb">load</i>}>
          <Inner />
        </React.Suspense>
        after
      </div>,
    )
    resolve!('done')
    const out = await streamToString(stream)
    expect(out).toContain('<i id="fb">load</i>')
    expect(out).toContain('<span id="real">done</span>')
    expect(out).toContain('$RC(')
    await stream.allReady
  })
})

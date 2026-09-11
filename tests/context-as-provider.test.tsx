import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToReadableStream, renderToStaticMarkup, renderToString } from 'react-dom/server'

const cleanups: Array<() => void> = []
function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: React.ReactNode) => flushSync(() => root.render(node)) }
}
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

describe('React 19 context as provider', () => {
  it('uses the context itself as its Provider', () => {
    const Context = React.createContext('default')
    expect(Context.Provider).toBe(Context)
  })

  it.each(['jsx', 'createElement'])('supports every context reader through %s', (mode) => {
    const { container, render } = setup()
    const Context = React.createContext('default')
    const Hook = React.memo(() => <b>{React.useContext(Context)}</b>)
    function Use() { return <i>{React.use(Context)}</i> }
    class Class extends React.Component {
      static contextType = Context
      render() { return <u>{this.context as string}</u> }
    }
    const children = <><Hook /><Use /><Class /><Context.Consumer>{value => <s>{value}</s>}</Context.Consumer></>
    render(mode === 'jsx' ? <Context value="provided">{children}</Context> : React.createElement(Context, { value: 'provided' }, children))
    expect(container.textContent).toBe('providedprovidedprovidedprovided')
  })

  it('updates memoized consumers and respects nested providers in either syntax', () => {
    const { container, render } = setup()
    const Context = React.createContext<string | undefined>('default')
    const Reader = React.memo(() => <span>{String(React.useContext(Context))}</span>)
    const Inner = React.memo(() => <Context.Provider value="inner"><Reader /></Context.Provider>)
    const tree = (value: string | undefined) => <><Reader /><Context value={value}><Reader /><Inner /><Context value="direct"><Reader /></Context></Context></>
    render(tree('first'))
    const nodes = [...container.querySelectorAll('span')]
    render(tree('second'))
    expect(container.textContent).toBe('defaultsecondinnerdirect')
    render(tree(undefined))
    expect(container.textContent).toBe('defaultundefinedinnerdirect')
    expect([...container.querySelectorAll('span')]).toEqual(nodes)
  })

  it('preserves state, refs, effects and DOM when switching provider syntax', () => {
    const { container, render } = setup()
    const Context = React.createContext('default')
    let increment!: () => void
    const effects: string[] = []
    const ref = React.createRef<HTMLButtonElement>()
    function Child() {
      const [count, setCount] = React.useState(0)
      increment = () => setCount(value => value + 1)
      React.useLayoutEffect(() => { effects.push('mount'); return () => { effects.push('unmount') } }, [])
      return <button ref={ref}>{`${React.useContext(Context)}:${count}`}</button>
    }
    render(<Context.Provider value="first"><Child /></Context.Provider>)
    const node = ref.current
    flushSync(increment)
    expect(container.textContent).toBe('first:1')
    render(<Context value="second"><Child /></Context>)
    expect(container.textContent).toBe('second:1')
    expect(ref.current).toBe(node)
    render(<Context.Provider value="third"><Child /></Context.Provider>)
    expect(container.textContent).toBe('third:1')
    expect(ref.current).toBe(node)
    expect(effects).toEqual(['mount'])
  })

  it('keeps provider values local to each root', () => {
    const first = setup()
    const second = setup()
    const Context = React.createContext('default')
    function Reader() { return <span>{React.useContext(Context)}</span> }
    first.render(<Context value="first"><Reader /></Context>)
    second.render(<Reader />)
    expect(first.container.textContent).toBe('first')
    expect(second.container.textContent).toBe('default')
  })

  it.each(['string', 'static', 'stream'])('supports nested providers in %s SSR and restores the default', async (mode) => {
    const Context = React.createContext('default')
    function Reader() { return <b>{React.useContext(Context)}</b> }
    const tree = <><Context value="outer"><Reader /><Context.Provider value="inner"><Reader /></Context.Provider><Reader /></Context><Reader /></>
    const html = mode === 'stream'
      ? await new Response(await renderToReadableStream(tree)).text()
      : mode === 'static' ? renderToStaticMarkup(tree) : renderToString(tree)
    expect(html).toBe('<b>outer</b><b>inner</b><b>outer</b><b>default</b>')
    expect(renderToString(<Reader />)).toBe('<b>default</b>')
  })

  it('restores the server default when a direct provider child throws', () => {
    const Context = React.createContext('default')
    function Fail(): never { throw new Error('provider child failed') }
    expect(() => renderToString(<Context value="provided"><Fail /></Context>)).toThrow('provider child failed')
    expect(renderToString(<Context.Consumer>{value => <b>{value}</b>}</Context.Consumer>)).toBe('<b>default</b>')
  })

  it('hydrates a direct provider without replacing nodes and supports later updates', async () => {
    const Context = React.createContext('default')
    function Reader() { return <b>{React.useContext(Context)}</b> }
    const tree = (value: string) => <Context value={value}><Reader /></Context>
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = renderToString(tree('server'))
    const node = container.firstChild
    const errors: unknown[] = []
    let root!: ReturnType<typeof hydrateRoot>
    await React.act(async () => { root = hydrateRoot(container, tree('server'), { onRecoverableError: error => errors.push(error) }) })
    cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
    expect(container.firstChild).toBe(node)
    flushSync(() => root.render(tree('updated')))
    expect(container.firstChild).toBe(node)
    expect(container.textContent).toBe('updated')
    expect(errors).toEqual([])
  })
})

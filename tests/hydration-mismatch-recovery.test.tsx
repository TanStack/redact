import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

function install(html: string): HTMLDivElement {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

function hydratePair(server: React.ReactNode, client: React.ReactNode) {
  const container = install(renderToString(server as any))
  const errors: unknown[] = []
  hydrateRoot(container, client as any, {
    onRecoverableError: (e) => errors.push(e),
  })
  return { container, errors }
}

function suspenseShell(child: React.ReactNode, stableText = 'stable') {
  return (
    <main>
      <h1 id="stable">{stableText}</h1>
      <React.Suspense fallback={<i>loading</i>}>{child}</React.Suspense>
      <footer id="footer">footer</footer>
    </main>
  )
}

describe('hydration mismatch recovery', () => {
  it('root fallback produces one clean client tree for wrong element type', () => {
    const { container, errors } = hydratePair(
      <span id="root">server</span>,
      <div id="root">client</div>,
    )

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll('#root').length).toBe(1)
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('div')
    expect(container.textContent).toBe('client')
  })

  it('root fallback removes extra server nodes', () => {
    const { container, errors } = hydratePair(
      <div id="root">
        <span>client</span>
        <b id="extra">server-only</b>
      </div>,
      <div id="root">
        <span>client</span>
      </div>,
    )

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll('#root').length).toBe(1)
    expect(container.querySelector('#extra')).toBeNull()
    expect(container.textContent).toBe('client')
  })

  it('root fallback inserts missing client nodes', () => {
    const { container, errors } = hydratePair(
      <div id="root">
        <span>one</span>
      </div>,
      <div id="root">
        <span>one</span>
        <span id="added">two</span>
      </div>,
    )

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll('#root').length).toBe(1)
    expect(container.querySelector('#added')?.textContent).toBe('two')
  })

  it('root fallback handles dangerouslySetInnerHTML mismatch', () => {
    const { container, errors } = hydratePair(
      <div id="root" dangerouslySetInnerHTML={{ __html: '<span>server</span>' }} />,
      <div id="root" dangerouslySetInnerHTML={{ __html: '<span>client</span>' }} />,
    )

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll('#root').length).toBe(1)
    expect(container.querySelector('#root')?.innerHTML).toBe('<span>client</span>')
  })

  it('root fallback handles form control value mismatch', () => {
    const { container, errors } = hydratePair(
      <input id="field" value="server" readOnly />,
      <input id="field" value="client" readOnly />,
    )

    const input = container.querySelector('#field') as HTMLInputElement
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll('#field').length).toBe(1)
    expect(input.value).toBe('client')
  })

  it('comments injected before hydration do not force a fallback', () => {
    function App() {
      return (
        <div id="root">
          <span>client</span>
        </div>
      )
    }

    const container = install(renderToString(<App />))
    const root = container.querySelector('#root')!
    const span = container.querySelector('span')!
    root.insertBefore(document.createComment('extension'), span)
    const errors: unknown[] = []

    hydrateRoot(container, <App />, {
      onRecoverableError: (e) => errors.push(e),
    })

    expect(errors).toEqual([])
    expect(container.querySelector('#root')).toBe(root)
    expect(container.querySelector('span')).toBe(span)
  })

  it('Suspense-scoped text mismatch preserves siblings outside the boundary', () => {
    const server = suspenseShell(<section id="panel">React</section>)
    const client = suspenseShell(<section id="panel">Solid</section>)
    const container = install(renderToString(server as any))
    const stable = container.querySelector('#stable')
    const footer = container.querySelector('#footer')
    const errors: unknown[] = []

    hydrateRoot(container, client as any, {
      onRecoverableError: (e) => errors.push(e),
    })

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('#stable')).toBe(stable)
    expect(container.querySelector('#footer')).toBe(footer)
    expect(container.querySelectorAll('#panel').length).toBe(1)
    expect(container.querySelector('#panel')?.textContent).toBe('Solid')
  })

  it('Suspense-scoped attribute mismatch preserves siblings outside the boundary', () => {
    const server = suspenseShell(<img id="logo" alt="React" src="/react.svg" />)
    const client = suspenseShell(<img id="logo" alt="Solid" src="/solid.svg" />)
    const container = install(renderToString(server as any))
    const stable = container.querySelector('#stable')
    const errors: unknown[] = []

    hydrateRoot(container, client as any, {
      onRecoverableError: (e) => errors.push(e),
    })

    const logo = container.querySelector('#logo') as HTMLImageElement
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('#stable')).toBe(stable)
    expect(container.querySelectorAll('#logo').length).toBe(1)
    expect(logo.getAttribute('alt')).toBe('Solid')
    expect(logo.getAttribute('src')).toBe('/solid.svg')
  })

  it('Suspense-scoped extra server node recovery preserves siblings outside the boundary', () => {
    const server = suspenseShell(
      <section id="panel">
        <span>client</span>
        <b id="extra">server-only</b>
      </section>,
    )
    const client = suspenseShell(
      <section id="panel">
        <span>client</span>
      </section>,
    )
    const container = install(renderToString(server as any))
    const stable = container.querySelector('#stable')
    const errors: unknown[] = []

    hydrateRoot(container, client as any, {
      onRecoverableError: (e) => errors.push(e),
    })

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('#stable')).toBe(stable)
    expect(container.querySelector('#extra')).toBeNull()
    expect(container.querySelector('#panel')?.textContent).toBe('client')
  })

  it('Suspense-scoped missing server node recovery preserves siblings outside the boundary', () => {
    const server = suspenseShell(
      <section id="panel">
        <span>one</span>
      </section>,
    )
    const client = suspenseShell(
      <section id="panel">
        <span>one</span>
        <span id="added">two</span>
      </section>,
    )
    const container = install(renderToString(server as any))
    const stable = container.querySelector('#stable')
    const errors: unknown[] = []

    hydrateRoot(container, client as any, {
      onRecoverableError: (e) => errors.push(e),
    })

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('#stable')).toBe(stable)
    expect(container.querySelector('#added')?.textContent).toBe('two')
  })

  it('Suspense-scoped recovery attaches events to the client-rendered subtree', () => {
    function ClientPanel() {
      const [n, setN] = React.useState(0)
      return (
        <button id="btn" onClick={() => setN((v) => v + 1)}>
          {n}
        </button>
      )
    }

    const server = suspenseShell(<button id="btn">server</button>)
    const client = suspenseShell(<ClientPanel />)
    const container = install(renderToString(server as any))
    const stable = container.querySelector('#stable')
    const errors: unknown[] = []

    hydrateRoot(container, client as any, {
      onRecoverableError: (e) => errors.push(e),
    })

    const button = container.querySelector('#btn') as HTMLButtonElement
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('#stable')).toBe(stable)
    expect(button.textContent).toBe('0')
    flushSync(() => button.click())
    expect(button.textContent).toBe('1')
  })

  it('nearest host recovery preserves siblings outside the failed host subtree', () => {
    const server = (
      <main>
        <header id="stable">stable</header>
        <section id="island">
          <span id="value">React</span>
        </section>
        <footer id="footer">footer</footer>
      </main>
    )
    const client = (
      <main>
        <header id="stable">stable</header>
        <section id="island">
          <span id="value">Solid</span>
        </section>
        <footer id="footer">footer</footer>
      </main>
    )
    const container = install(renderToString(server as any))
    const stable = container.querySelector('#stable')
    const island = container.querySelector('#island')
    const footer = container.querySelector('#footer')
    const errors: unknown[] = []

    hydrateRoot(container, client as any, {
      onRecoverableError: (e) => errors.push(e),
    })

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('#stable')).toBe(stable)
    expect(container.querySelector('#footer')).toBe(footer)
    expect(container.querySelector('#island')).toBe(island)
    expect(container.querySelectorAll('#value').length).toBe(1)
    expect(container.querySelector('#value')?.textContent).toBe('Solid')
  })

  it('nearest host recovery remounts a live subtree with event handlers', () => {
    function Counter() {
      const [n, setN] = React.useState(0)
      return (
        <button id="counter" onClick={() => setN((v) => v + 1)}>
          {n}
        </button>
      )
    }

    const server = (
      <main>
        <header id="stable">stable</header>
        <section id="island">
          <button id="counter">server</button>
        </section>
      </main>
    )
    const client = (
      <main>
        <header id="stable">stable</header>
        <section id="island">
          <Counter />
        </section>
      </main>
    )
    const container = install(renderToString(server as any))
    const stable = container.querySelector('#stable')
    const island = container.querySelector('#island')
    const errors: unknown[] = []

    hydrateRoot(container, client as any, {
      onRecoverableError: (e) => errors.push(e),
    })

    const button = container.querySelector('#counter') as HTMLButtonElement
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('#stable')).toBe(stable)
    expect(container.querySelector('#island')).toBe(island)
    expect(button.textContent).toBe('0')
    flushSync(() => button.click())
    expect(button.textContent).toBe('1')
  })

  it('error boundary checkpoint recovery preserves siblings outside the boundary', () => {
    class Boundary extends React.Component<{ children: React.ReactNode }> {
      static getDerivedStateFromError() {
        return null
      }
      render() {
        return this.props.children
      }
    }

    const server = (
      <main>
        <header id="stable">stable</header>
        <Boundary>
          <section id="boundary-content">React</section>
        </Boundary>
        <footer id="footer">footer</footer>
      </main>
    )
    const client = (
      <main>
        <header id="stable">stable</header>
        <Boundary>
          <section id="boundary-content">Solid</section>
        </Boundary>
        <footer id="footer">footer</footer>
      </main>
    )
    const container = install(renderToString(server as any))
    const stable = container.querySelector('#stable')
    const footer = container.querySelector('#footer')
    const errors: unknown[] = []

    hydrateRoot(container, client as any, {
      onRecoverableError: (e) => errors.push(e),
    })

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('#stable')).toBe(stable)
    expect(container.querySelector('#footer')).toBe(footer)
    expect(container.querySelectorAll('#boundary-content').length).toBe(1)
    expect(container.querySelector('#boundary-content')?.textContent).toBe('Solid')
  })

  it('uncaught render error during Suspense hydration clears only that boundary before throwing', () => {
    function BadPanel() {
      throw new Error('panel boom')
    }

    const server = suspenseShell(<section id="panel">server</section>)
    const client = suspenseShell(<BadPanel />)
    const container = install(renderToString(server as any))
    const stable = container.querySelector('#stable')

    expect(() => hydrateRoot(container, client as any)).toThrow('panel boom')
    expect(container.querySelector('#stable')).toBe(stable)
    expect(container.querySelector('#panel')).toBeNull()
    expect(container.querySelector('#footer')?.textContent).toBe('footer')
  })
})

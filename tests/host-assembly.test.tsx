import { afterEach, expect, it } from 'vitest'
import { Component, createElement, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal, flushSync } from 'react-dom'
import type { ReactNode } from 'react'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
function setup(connected = true) {
  const container = document.createElement('div')
  if (connected) document.body.appendChild(container)
  const root = createRoot(container, { onCaughtError() {} })
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: ReactNode) => flushSync(() => root.render(node)) }
}

it('connects newly allocated custom element parents with complete children', () => {
  const { container, render } = setup()
  const connected: string[] = []
  const tag = 'redact-complete-children'
  customElements.define(tag, class extends HTMLElement {
    connectedCallback() { connected.push(this.innerHTML) }
  })
  render(createElement(tag, null, <span>child</span>, <em>tail</em>))
  expect(connected).toEqual(['<span>child</span><em>tail</em>'])
  expect(container.textContent).toBe('childtail')
})

it('keeps an existing live host unchanged while rendering replacement descendants', () => {
  const { container, render } = setup()
  const observed: string[] = []
  function Read() { observed.push(container.innerHTML); return <b>last</b> }
  render(<section><i>old</i></section>)
  const section = container.firstChild
  render(<section><article><span>new</span><Read /></article></section>)
  expect(observed).toEqual(['<section><i>old</i></section>'])
  expect(container.firstChild).toBe(section)
  expect(container.innerHTML).toBe('<section><article><span>new</span><b>last</b></article></section>')
})

it('does not eagerly assemble children into a user-owned detached root', () => {
  const { container, render } = setup(false)
  const observed: string[] = []
  function Read() { observed.push(container.textContent!); return <b>last</b> }
  render(<><span>first</span><Read /></>)
  expect(observed).toEqual([''])
  observed.length = 0
  render(<><section>next</section><Read /></>)
  expect(observed).toEqual(['firstlast'])
  expect(container.textContent).toBe('nextlast')
  expect(container.isConnected).toBe(false)
})

it('does not eagerly assemble children into a user-owned detached portal container', () => {
  const { render } = setup()
  const portal = document.createElement('div')
  const foreign = document.createElement('i'); foreign.textContent = 'user'; portal.appendChild(foreign)
  const observed: string[] = []
  function Read() { observed.push(portal.textContent!); return <b>last</b> }
  const view = (value: string) => <section>{createPortal(<article><span>{value}</span><Read /></article>, portal)}</section>
  render(view('first'))
  expect(observed).toEqual(['user'])
  observed.length = 0
  render(view('next'))
  expect(observed).toEqual(['userfirstlast'])
  expect(portal.textContent).toBe('usernextlast')
  expect(portal.firstChild).toBe(foreign)
  expect(portal.isConnected).toBe(false)
})

function Suspend(): never { throw pending }
const pending = new Promise<void>(() => {})

class ErrorBoundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <i>error</i> : this.props.children }
}

it('discards a partially assembled primary inside a new host when Suspense falls back', () => {
  const { container, render } = setup()
  render(<section><u>prefix</u><Suspense fallback={<i>loading</i>}>
    <b>abandoned</b><Suspend />
  </Suspense><em>tail</em></section>)
  expect(container.innerHTML).toBe('<section><u>prefix</u><i>loading</i><em>tail</em></section>')
})

it('discards a partially assembled child tree inside a new host when an error boundary falls back', () => {
  const { container, render } = setup()
  function Throw(): never { throw new Error('expected') }
  render(<section><u>prefix</u><ErrorBoundary>
    <b>abandoned</b><Throw />
  </ErrorBoundary><em>tail</em></section>)
  expect(container.innerHTML).toBe('<section><u>prefix</u><i>error</i><em>tail</em></section>')
})

it('restores the outer prepared-parent prefix after nested Suspense checkpoints rewind', () => {
  const { container, render } = setup()
  render(<section><u>prefix</u><Suspense fallback={<i>outer</i>}>
    <b>outer-abandoned</b>
    <Suspense fallback={<small>inner</small>}><span>inner-abandoned</span><Suspend /></Suspense>
    <Suspend />
  </Suspense><em>tail</em></section>)
  expect(container.innerHTML).toBe('<section><u>prefix</u><i>outer</i><em>tail</em></section>')
})

for (const suspend of [false, true]) {
  it(`connects a complete custom parent after a ${suspend ? 'caught' : 'successful'} Suspense checkpoint`, () => {
    const { container, render } = setup()
    const connected: string[] = []
    const tag = `redact-complete-suspense-${suspend}`
    customElements.define(tag, class extends HTMLElement {
      connectedCallback() { connected.push(this.innerHTML) }
    })
    render(createElement(tag, null, <u>prefix</u>, <Suspense fallback={<i>loading</i>}>
      <span>{suspend ? 'abandoned' : 'ready'}</span>{suspend ? <Suspend /> : null}
    </Suspense>, <em>tail</em>))
    const expected = `<u>prefix</u>${suspend ? '<i>loading</i>' : '<span>ready</span>'}<em>tail</em>`
    expect(connected).toEqual([expected])
    expect(container.firstElementChild!.innerHTML).toBe(expected)
  })
}

import { afterEach, expect, it, vi } from 'vitest'
import { Component, Suspense, useState, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanup: Array<() => void> = []
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose() })
const original = new Error('loader failure'), fallbackError = new Error('fallback failure')
class Boundary extends Component<{ children?: ReactNode, fallback: (error: Error) => ReactNode, caught?: (error: Error) => void }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { this.props.caught?.(error) }
  render() { return this.state.error ? this.props.fallback(this.state.error) : this.props.children }
}
function ErrorPage() { const [count, setCount] = useState(0); return <button onClick={() => setCount(value => value + 1)}>error {count}</button> }
function Thrower(): never { throw original }
function Rethrow({ error }: { error: Error }): never { throw error }

it.each(['csr', 'hydrate', 'scheduled', 'commit'] as const)('%s: bubbles a fallback rethrow to the enclosing boundary and preserves the Suspense range', async mode => {
  const container = document.createElement('div')
  document.body.append(container)
  cleanup.push(() => container.remove())
  const caught = vi.fn(), innerCaught = vi.fn(), errors = vi.fn()
  let trigger!: () => void
  function Child() {
    const [failed, setFailed] = useState(false)
    trigger = () => setFailed(true)
    if (mode === 'csr' || mode === 'hydrate' || failed) return <Thrower />
    return <span ref={mode === 'commit' ? () => { throw original } : undefined}>ready</span>
  }
  const tree = <main><Suspense fallback={null}><Boundary fallback={() => <ErrorPage />} caught={caught}><Boundary fallback={error => <Rethrow error={error} />} caught={innerCaught}><Child /></Boundary></Boundary></Suspense><em>after</em></main>
  if (mode === 'hydrate') container.innerHTML = '<main><!--$0--><p>server generic error</p><!--/$--><em>after</em></main>'
  const sibling = container.querySelector('em')
  const root = mode === 'hydrate' ? hydrateRoot(container, tree, { onRecoverableError() {}, onUncaughtError: errors }) : createRoot(container, { onUncaughtError: errors })
  cleanup.push(() => root.unmount())
  if (mode !== 'hydrate') flushSync(() => root.render(tree))
  if (mode === 'scheduled') flushSync(trigger)
  await vi.waitFor(() => expect(container.querySelector('button')?.textContent).toBe('error 0'))
  expect(caught).toHaveBeenCalledTimes(1)
  expect(caught).toHaveBeenCalledWith(original)
  expect(innerCaught).not.toHaveBeenCalled()
  expect(errors).not.toHaveBeenCalled()
  if (mode === 'hydrate') {
    expect(container.querySelector('em')).toBe(sibling)
    const main = container.querySelector('main')!
    const start = Array.from(main.childNodes).find(node => node.nodeType === 8 && node.textContent?.startsWith('$'))!
    const end = Array.from(main.childNodes).find(node => node.nodeType === 8 && node.textContent === '/$')!
    expect(start.compareDocumentPosition(container.querySelector('button')!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(container.querySelector('button')!.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  }
  flushSync(() => container.querySelector('button')!.click())
  expect(container.querySelector('button')?.textContent).toBe('error 1')
})

it('lets a newly nested boundary catch during fallback recovery, then restores the original boundary after reset', () => {
  const container = document.createElement('div'), nestedCaught = vi.fn(), outerCaught = vi.fn(), innerCaught = vi.fn()
  let inner!: Boundary
  const tree = (fail: boolean) => <Boundary fallback={() => <p>outer</p>} caught={outerCaught}><Boundary ref={value => { if (value) inner = value }} fallback={() => <Boundary fallback={() => <p>nested</p>} caught={nestedCaught}><Rethrow error={fallbackError} /></Boundary>} caught={innerCaught}>{fail ? <Thrower /> : <span>ready</span>}</Boundary></Boundary>
  const root = createRoot(container)
  cleanup.push(() => root.unmount())
  flushSync(() => root.render(tree(true)))
  expect(container.textContent).toBe('nested')
  expect(nestedCaught).toHaveBeenCalledWith(fallbackError)
  expect(innerCaught).toHaveBeenCalledWith(original)
  expect(outerCaught).not.toHaveBeenCalled()
  flushSync(() => { root.render(tree(false)); inner.setState({ error: null }) })
  expect(container.textContent).toBe('ready')
  flushSync(() => root.render(tree(true)))
  expect(container.textContent).toBe('nested')
  expect(innerCaught).toHaveBeenCalledTimes(2)
})

it('bubbles a different fallback error and clears recovery scope after an uncaught fallback', () => {
  const container = document.createElement('div'), caught = vi.fn(), uncaught = vi.fn()
  const root = createRoot(container, { onUncaughtError: uncaught })
  cleanup.push(() => root.unmount())
  const inner = <Boundary fallback={() => <Rethrow error={fallbackError} />}><Thrower /></Boundary>
  flushSync(() => root.render(inner))
  expect(uncaught).toHaveBeenCalledWith(fallbackError, expect.anything())
  flushSync(() => root.render(<Boundary fallback={() => <ErrorPage />} caught={caught}>{inner}</Boundary>))
  expect(caught).toHaveBeenCalledWith(fallbackError)
  expect(container.textContent).toBe('error 0')
})

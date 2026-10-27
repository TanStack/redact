import { describe, expect, it, vi } from 'vitest'
import { act, Suspense, use } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

/**
 * React's Flight client hands out its chunks as thenables that already carry a
 * status of their own: 'resolved_model' and 'resolved_module' until something
 * subscribes (their `then` initializes them synchronously), and 'blocked' or
 * 'pending' until their data arrives. Like ReactFlightClient's ReactPromise,
 * these never settle unless `then` is called. Next.js App Router passes them to
 * the browser renderer as children and to `use()`.
 */
class FlightChunk<T> {
  status: string
  value: any
  reason: any
  private init: (() => T) | undefined
  private listeners: Array<(value: T) => void> = []

  constructor(status: 'resolved_model' | 'blocked', init?: () => T) {
    this.status = status
    this.value = null
    this.reason = null
    this.init = init
  }

  then(resolve?: (value: T) => void, _reject?: (reason: unknown) => void): void {
    if (this.status === 'resolved_model') {
      this.status = 'fulfilled'
      this.value = this.init!()
    }
    if (this.status === 'fulfilled') resolve?.(this.value)
    else if (resolve) this.listeners.push(resolve)
  }

  resolve(value: T): void {
    this.status = 'fulfilled'
    this.value = value
    for (const listener of this.listeners.splice(0)) listener(value)
  }
}

function setup(html = '') {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

describe('Flight chunk thenables', () => {
  it.each([
    { name: 'as a child', render: (chunk: any) => <p>{chunk}</p> },
    { name: 'through use()', render: (chunk: any) => { function Read() { return <p>{use(chunk) as any}</p> } return <Read /> } },
  ])('renders a resolved_model chunk $name in the same pass', async ({ render }) => {
    const container = setup(), root = createRoot(container), uncaught = vi.fn()
    window.addEventListener('error', uncaught)
    try {
      const chunk = new FlightChunk('resolved_model', () => 'from the server')
      await act(() => root.render(<Suspense fallback="Loading">{render(chunk)}</Suspense>))
      expect(container.textContent).toBe('from the server')
      expect(uncaught).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('error', uncaught)
      await act(() => root.unmount())
    }
  })

  it.each([
    { name: 'as a child', render: (chunk: any) => <p>{chunk}</p> },
    { name: 'through use()', render: (chunk: any) => { function Read() { return <p>{use(chunk) as any}</p> } return <Read /> } },
  ])('suspends on a blocked chunk $name and renders once it resolves', async ({ render }) => {
    const container = setup(), root = createRoot(container), uncaught = vi.fn()
    window.addEventListener('error', uncaught)
    try {
      const chunk = new FlightChunk<string>('blocked')
      await act(() => root.render(<Suspense fallback="Loading">{render(chunk)}</Suspense>))
      expect(container.textContent).toBe('Loading')
      await act(async () => chunk.resolve('arrived later'))
      expect(container.textContent).toBe('arrived later')
      expect(uncaught).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('error', uncaught)
      await act(() => root.unmount())
    }
  })

  it.each([
    { name: 'resolved_model', chunk: () => new FlightChunk('resolved_model', () => 'streamed'), settle: () => {} },
    { name: 'blocked', chunk: () => new FlightChunk<string>('blocked'), settle: (chunk: any) => chunk.resolve('streamed') },
  ])('hydrates server HTML over a $name chunk child without errors', async ({ chunk: make, settle }) => {
    const html = renderToString(<main><Suspense fallback="Loading"><p>streamed</p></Suspense></main>)
    const container = setup(html), uncaught = vi.fn(), recoverable = vi.fn()
    const paragraph = container.querySelector('p')
    window.addEventListener('error', uncaught)
    const chunk = make()
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await act(async () => {
        root = hydrateRoot(container, <main><Suspense fallback="Loading"><p>{chunk as any}</p></Suspense></main>, { onRecoverableError: recoverable })
      })
      await act(async () => settle(chunk))
      expect(container.textContent).toBe('streamed')
      expect(container.querySelector('p')).toBe(paragraph)
      expect(uncaught).not.toHaveBeenCalled()
      expect(recoverable).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('error', uncaught)
      await act(() => root?.unmount())
    }
  })
  it.each([
    { name: 'as a child', render: (chunk: any) => <p>{chunk}</p> },
    { name: 'through use()', render: (chunk: any) => { function Read() { return <p>{use(chunk) as any}</p> } return <Read /> } },
  ])('hydrates a resolved_model chunk $name with no Suspense boundary above it', async ({ render }) => {
    const container = setup(renderToString(<main><p>streamed</p></main>)), uncaught = vi.fn(), recoverable = vi.fn()
    const paragraph = container.querySelector('p')
    window.addEventListener('error', uncaught)
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      const chunk = new FlightChunk('resolved_model', () => 'streamed')
      await act(async () => {
        root = hydrateRoot(container, <main>{render(chunk)}</main>, { onRecoverableError: recoverable })
      })
      expect(container.textContent).toBe('streamed')
      expect(container.querySelector('p')).toBe(paragraph)
      expect(uncaught).not.toHaveBeenCalled()
      expect(recoverable).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('error', uncaught)
      await act(() => root?.unmount())
    }
  })
})

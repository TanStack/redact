import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { ViewTransition as Boundary, startTransition, useEffect, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const native = document.startViewTransition?.bind(document)
const transitions: ViewTransition[] = []
const releases: Array<() => Promise<void>> = []
const cleanups: Array<() => void> = []

afterEach(async () => {
  for (const release of releases.splice(0)) await release()
  for (const transition of transitions.splice(0)) {
    transition.skipTransition()
    await transition.finished.catch(() => {})
  }
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})

function setup(onRecoverableError = vi.fn<(...args: unknown[]) => void>()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const onUncaughtError = vi.fn()
  const root = createRoot(container, { onRecoverableError, onUncaughtError })
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, root, onRecoverableError, onUncaughtError }
}

function observeNative() {
  return vi.spyOn(document, 'startViewTransition').mockImplementation(options => {
    const transition = native!(options)
    transition.ready.catch(() => {})
    transitions.push(transition)
    return transition
  })
}

function controlledNative() {
  let rejectReady!: (error: unknown) => void
  let resolveUpdate!: () => void
  let resolveFinished!: () => void
  let update: ViewTransitionUpdateCallback | null | undefined
  const ready = new Promise<void>((_, reject) => { rejectReady = reject })
  const callbackErrors: unknown[] = []
  const then = ready.then.bind(ready)
  ready.then = <T = void, E = never>(
    fulfilled?: ((value: void) => T | PromiseLike<T>) | null,
    rejected?: ((error: unknown) => E | PromiseLike<E>) | null,
  ): Promise<T | E> => {
    const result = then<T, E>(fulfilled, rejected)
    result.catch(error => { callbackErrors.push(error) })
    return result
  }
  ready.catch(() => {})
  const transition: ViewTransition = {
    ready,
    updateCallbackDone: new Promise<void>(resolve => { resolveUpdate = resolve }),
    finished: new Promise<void>(resolve => { resolveFinished = resolve }),
    types: new Set<string>(),
    skipTransition: vi.fn(() => { rejectReady(new DOMException('Skipped by caller', 'AbortError')) }),
  }
  const start = vi.spyOn(document, 'startViewTransition').mockImplementation(options => {
    update = typeof options === 'function' ? options : options?.update
    return transition
  })
  let complete = false
  async function finish() {
    if (complete) return
    complete = true
    await update?.()
    resolveUpdate()
    resolveFinished()
    await transition.finished
  }
  releases.push(finish)
  return { start, transition, rejectReady, finish, callbackErrors }
}

describe.runIf(!!native)('native rejection fallback', () => {
  it('recovers from real duplicate names and can animate the next valid update', async () => {
    const { container, root, onRecoverableError, onUncaughtError } = setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    observeNative()
    const layout = vi.fn()
    const passive = vi.fn()
    const animated = vi.fn()
    let set!: (value: number) => void
    let unique!: () => void
    function App() {
      const [value, update] = useState(0); set = update
      const [duplicate, change] = useState(true); unique = () => change(false)
      useLayoutEffect(() => { layout(value) }, [value])
      useEffect(() => { passive(value) }, [value])
      return <>
        <Boundary name="duplicate-name" onUpdate={animated}><div style={{ viewTransitionName: 'author-first' }}>{value}</div></Boundary>
        <Boundary name={duplicate ? 'duplicate-name' : 'unique-name'} onUpdate={animated}><div style={{ viewTransitionName: 'author-second' }}>{value}</div></Boundary>
      </>
    }
    flushSync(() => root.render(<App />))
    await vi.waitFor(() => expect(passive.mock.calls).toEqual([[0]]))
    layout.mockClear(); passive.mockClear()
    startTransition(() => set(1))
    await vi.waitFor(() => expect(transitions).toHaveLength(1))
    const failure = await transitions[0]!.ready.catch(error => error)
    expect(failure).toMatchObject({ name: 'InvalidStateError' })
    // Some browsers collapse duplicate names into the generic invalid-state
    // error that React deliberately suppresses.
    const reports = failure.message === 'Transition was aborted because of invalid state' ? 0 : 1
    await transitions[0]!.finished
    await vi.waitFor(() => expect(passive.mock.calls).toEqual([[1]]))
    expect(container.textContent).toBe('11')
    expect(layout.mock.calls).toEqual([[1]])
    expect(onRecoverableError).toHaveBeenCalledTimes(reports)
    if (reports) expect(onRecoverableError.mock.calls[0]![1]).toEqual({ componentStack: null })
    expect(onUncaughtError).not.toHaveBeenCalled()
    expect(animated).not.toHaveBeenCalled()
    expect((container.children[0] as HTMLElement).style.viewTransitionName).toBe('author-first')
    expect((container.children[1] as HTMLElement).style.viewTransitionName).toBe('author-second')
    flushSync(unique)
    startTransition(() => set(2))
    await vi.waitFor(() => expect(transitions).toHaveLength(2))
    await transitions[1]!.ready
    await vi.waitFor(() => expect(animated).toHaveBeenCalledTimes(2))
    expect(onRecoverableError).toHaveBeenCalledTimes(reports)
  })

  it('falls back without reporting when native start throws synchronously', async () => {
    const { container, root, onRecoverableError, onUncaughtError } = setup()
    const start = vi.spyOn(document, 'startViewTransition').mockImplementation(() => {
      throw new DOMException('Native start unavailable', 'InvalidStateError')
    })
    const layout = vi.fn()
    const passive = vi.fn()
    const animated = vi.fn()
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      useLayoutEffect(() => { layout(value) }, [value])
      useEffect(() => { passive(value) }, [value])
      return <Boundary name="native-throw" onUpdate={animated}><div style={{ viewTransitionName: 'author-name' }}>{value}</div></Boundary>
    }
    flushSync(() => root.render(<App />))
    await vi.waitFor(() => expect(passive.mock.calls).toEqual([[0]]))
    layout.mockClear(); passive.mockClear()
    startTransition(() => set(1))
    await vi.waitFor(() => expect(passive.mock.calls).toEqual([[1]]))
    expect(start).toHaveBeenCalledTimes(1)
    expect(layout.mock.calls).toEqual([[1]])
    expect(container.textContent).toBe('1')
    expect((container.firstElementChild as HTMLElement).style.viewTransitionName).toBe('author-name')
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(onUncaughtError).not.toHaveBeenCalled()
    expect(animated).not.toHaveBeenCalled()
  })

  const silentMessages = [
    'View transition was skipped because document visibility state is hidden.',
    'Skipping view transition because document visibility state has become hidden.',
    'Skipping view transition because viewport size changed.',
    'Transition was aborted because of invalid state',
  ]
  it.each([
    ...silentMessages.map(message => ({ message, name: 'InvalidStateError', reports: false })),
    { message: 'Unexpected invalid capture state', name: 'InvalidStateError', reports: true },
    { message: 'External transition replaced this one', name: 'AbortError', reports: true },
    { message: 'Native transition timed out', name: 'TimeoutError', reports: true },
  ])('handles rejected ready before update: $message', async ({ message, name, reports }) => {
    const { container, root, onRecoverableError, onUncaughtError } = setup()
    const controlled = controlledNative()
    const events: string[] = []
    const reportedDOM: string[] = []
    onRecoverableError.mockImplementation(() => { reportedDOM.push(container.textContent!) })
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      useLayoutEffect(() => { events.push(`layout:${value}`) }, [value])
      return <Boundary name="early-rejection"><div>{value}</div></Boundary>
    }
    flushSync(() => root.render(<App />)); events.length = 0
    startTransition(() => set(1))
    await vi.waitFor(() => expect(controlled.start).toHaveBeenCalledTimes(1))
    expect(container.textContent).toBe('0')
    controlled.rejectReady(new DOMException(message, name))
    await vi.waitFor(() => expect(container.textContent).toBe('1'))
    expect(events).toEqual(['layout:1'])
    expect(onRecoverableError).toHaveBeenCalledTimes(reports ? 1 : 0)
    expect(reportedDOM).toEqual(reports ? ['0'] : [])
    if (reports) expect(onRecoverableError.mock.calls[0]![1]).toEqual({ componentStack: null })
    expect(onUncaughtError).not.toHaveBeenCalled()
    await controlled.finish()
    expect(events).toEqual(['layout:1'])
    expect(controlled.callbackErrors).toEqual([])
  })

  it('commits once even if the recoverable error handler throws', async () => {
    const handlerError = Error('recoverable handler failed')
    const onRecoverableError = vi.fn<(...args: unknown[]) => void>(() => { throw handlerError })
    const { container, root, onUncaughtError } = setup(onRecoverableError)
    const controlled = controlledNative()
    const layout = vi.fn()
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      useLayoutEffect(() => { layout(value) }, [value])
      return <Boundary name="throwing-error-handler"><div>{value}</div></Boundary>
    }
    flushSync(() => root.render(<App />)); layout.mockClear()
    startTransition(() => set(1))
    await vi.waitFor(() => expect(controlled.start).toHaveBeenCalledTimes(1))
    controlled.rejectReady(new DOMException('Invalid capture', 'InvalidStateError'))
    await vi.waitFor(() => expect(container.textContent).toBe('1'))
    expect(layout.mock.calls).toEqual([[1]])
    expect(onRecoverableError).toHaveBeenCalledTimes(1)
    expect(controlled.callbackErrors).toEqual([handlerError])
    expect(onUncaughtError).not.toHaveBeenCalled()
    await controlled.finish()
    expect(layout.mock.calls).toEqual([[1]])
  })

  it('does not report its own synchronous pre-ready cancellation', async () => {
    const { container, root, onRecoverableError, onUncaughtError } = setup()
    const controlled = controlledNative()
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      return <Boundary name="own-cancellation"><div>{value}</div></Boundary>
    }
    flushSync(() => root.render(<App />))
    startTransition(() => set(1))
    await vi.waitFor(() => expect(controlled.start).toHaveBeenCalledTimes(1))
    flushSync(() => set(2))
    await controlled.finish()
    expect(container.textContent).toBe('2')
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(onUncaughtError).not.toHaveBeenCalled()
  })

  it.each(['layout update', 'handler update', 'handler unmount'] as const)(
    'keeps early-rejection fallback reentrant for %s',
    async action => {
      const { container, root, onRecoverableError, onUncaughtError } = setup()
      const controlled = controlledNative()
      const events: string[] = []
      let set!: (value: number) => void
      function App() {
        const [value, update] = useState(0); set = update
        useLayoutEffect(() => {
          events.push(`layout:${value}:${container.textContent}`)
          if (action === 'layout update' && value === 1) update(2)
          return () => { events.push(`cleanup:${value}`) }
        }, [value])
        return <Boundary name="reentrant-rejection"><div>{value}</div></Boundary>
      }
      onRecoverableError.mockImplementation(() => {
        expect(container.textContent).toBe('0')
        if (action === 'handler update') flushSync(() => set(2))
        if (action === 'handler unmount') root.unmount()
      })
      flushSync(() => root.render(<App />)); events.length = 0
      startTransition(() => set(1))
      await vi.waitFor(() => expect(controlled.start).toHaveBeenCalledTimes(1))
      controlled.rejectReady(new DOMException('Rejected before update', 'InvalidStateError'))
      const unmounted = action === 'handler unmount'
      await vi.waitFor(() => expect(container.textContent).toBe(unmounted ? '' : '2'))
      const expected = ['cleanup:0', 'layout:1:1', 'cleanup:1', ...(unmounted ? [] : ['layout:2:2'])]
      expect(events).toEqual(expected)
      expect(onRecoverableError).toHaveBeenCalledTimes(1)
      expect(onUncaughtError).not.toHaveBeenCalled()
      await controlled.finish()
      expect(container.textContent).toBe(unmounted ? '' : '2')
      expect(events).toEqual(expected)
      expect(controlled.callbackErrors).toEqual([])
    },
  )
})

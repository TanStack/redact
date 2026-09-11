import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToPipeableStream, renderToReadableStream } from 'react-dom/server'

function trackedSignal() {
  const controller = new AbortController()
  return {
    controller,
    add: vi.spyOn(controller.signal, 'addEventListener'),
    remove: vi.spyOn(controller.signal, 'removeEventListener'),
  }
}

function expectDetached(tracked: ReturnType<typeof trackedSignal>) {
  const registration = tracked.add.mock.calls.find(([type]) => type === 'abort')
  expect(registration).toBeDefined()
  expect(tracked.remove).toHaveBeenCalledWith('abort', registration![1])
}

describe('React 19.3 stream lifecycle fixes', () => {
  // https://github.com/react/react/pull/37315
  it('detaches the caller abort signal after a successful render', async () => {
    const tracked = trackedSignal()
    const stream = await renderToReadableStream(<div>ready</div>, { signal: tracked.controller.signal })
    await stream.allReady
    expectDetached(tracked)
    expect(await new Response(stream).text()).toBe('<div>ready</div>')
  })

  it('detaches the caller abort signal after a shell error', async () => {
    const tracked = trackedSignal()
    const failure = new Error('shell failed')
    function Fail() { throw failure }
    await expect(renderToReadableStream(<Fail />, { signal: tracked.controller.signal, onError() {} })).rejects.toBe(failure)
    expectDetached(tracked)
  })

  it('detaches the caller abort signal when the caller aborts', async () => {
    const tracked = trackedSignal()
    const pending = new Promise<void>(() => {})
    function Pending() { throw pending }
    await renderToReadableStream(<React.Suspense fallback="loading"><Pending /></React.Suspense>, {
      signal: tracked.controller.signal,
    })
    tracked.controller.abort()
    expectDetached(tracked)
  })

  it('detaches the caller abort signal when the stream is cancelled', async () => {
    const tracked = trackedSignal()
    const pending = new Promise<void>(() => {})
    function Pending() { throw pending }
    const stream = await renderToReadableStream(<React.Suspense fallback="loading"><Pending /></React.Suspense>, {
      signal: tracked.controller.signal,
    })
    await stream.cancel()
    expectDetached(tracked)
  })

  // https://github.com/react/react/pull/36903, plus Redact's separate shell-ready task.
  it.each([new Error('shell failed'), null, undefined, 0])('does not report readiness after a shell failure (%s)', async (failure) => {
    const onShellReady = vi.fn()
    const onAllReady = vi.fn()
    const onShellError = vi.fn()
    function Fail() { throw failure }
    renderToPipeableStream(<Fail />, { onShellReady, onAllReady, onShellError, onError() {} })
    for (let i = 0; i < 4; i++) await Promise.resolve()
    expect(onShellError).toHaveBeenCalledTimes(1)
    expect(onShellError).toHaveBeenCalledWith(failure)
    expect(onShellReady).not.toHaveBeenCalled()
    expect(onAllReady).not.toHaveBeenCalled()
  })
})

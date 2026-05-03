/**
 * Callback refs must run during the commit phase, not during render.
 *
 * React's contract: callback refs fire from commitAttachRef in the layout-
 * effect phase, AFTER the component finishes rendering. Calling them inline
 * from renderHost violates the contract and breaks libraries that assert
 * "no event handlers during render".
 *
 * Concrete repro this guards against: base-ui's `useStableCallback` returns
 * a trampoline that throws "Base UI: Cannot call an event handler while
 * rendering" until commit swaps in the real callback. base-ui's
 * `useMergedRefs` composes refs through this trampoline, so any host
 * element with a base-ui-merged ref blew up at mount when redact's
 * attachRef ran callback refs synchronously.
 *
 * Beyond the base-ui assertion, render-time ref invocation is also a
 * latent footgun for any ref that triggers a setState (which would re-enter
 * the reconciler mid-traversal) — symptoms include unexpected child order,
 * dropped subtrees, and double-mounted DOM.
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

describe('callback refs — commit-phase semantics', () => {
  it('does not invoke a callback ref during render', () => {
    let rendering = false
    let calledDuringRender = false
    let calledAtAll = false
    let receivedNode: HTMLElement | null = null

    function App() {
      rendering = true
      try {
        return (
          <div
            id="target"
            ref={(el: HTMLDivElement | null) => {
              calledAtAll = true
              if (rendering) calledDuringRender = true
              receivedNode = el as HTMLElement | null
            }}
          />
        )
      } finally {
        rendering = false
      }
    }

    const container = setup()
    const root = createRoot(container)
    flushSync(() => root.render(<App />))

    // Must have been called by now (commit ran synchronously inside flushSync).
    expect(calledAtAll).toBe(true)
    expect(calledDuringRender).toBe(false)
    expect(receivedNode).toBe(container.querySelector('#target'))
  })

  it('runs the cleanup ref(null) on unmount', () => {
    const calls: Array<HTMLElement | null> = []
    function App({ show }: { show: boolean }) {
      return (
        <div>
          {show ? <span ref={(el: HTMLSpanElement | null) => calls.push(el as HTMLElement | null)} /> : null}
        </div>
      )
    }
    const container = setup()
    const root = createRoot(container)
    flushSync(() => root.render(<App show={true} />))
    expect(calls.length).toBe(1)
    expect(calls[0]).not.toBeNull()

    flushSync(() => root.render(<App show={false} />))
    expect(calls.length).toBe(2)
    expect(calls[1]).toBeNull()
  })

  it('runs the user-provided cleanup function returned from a callback ref', () => {
    const events: string[] = []
    function App({ show }: { show: boolean }) {
      return (
        <div>
          {show ? (
            <span
              ref={() => {
                events.push('attach')
                return () => {
                  events.push('cleanup')
                }
              }}
            />
          ) : null}
        </div>
      )
    }
    const container = setup()
    const root = createRoot(container)
    flushSync(() => root.render(<App show={true} />))
    expect(events).toEqual(['attach'])

    flushSync(() => root.render(<App show={false} />))
    expect(events).toEqual(['attach', 'cleanup'])
  })

  it('host element with a callback ref renders in source order alongside siblings', () => {
    // Repro shape from shadcn/ui Sidebar: a wrapped peer with a ref alongside
    // a plain main element. With render-phase ref invocation, the reconciler
    // could occasionally place children out of source order.
    const Ctx = React.createContext<string | null>(null)
    const refCallsDuringRender: number[] = []
    let renderDepth = 0

    function Peer() {
      renderDepth++
      try {
        return (
          <Ctx.Provider value="peer">
            <div
              data-slot="sidebar"
              ref={() => {
                refCallsDuringRender.push(renderDepth)
              }}
            />
          </Ctx.Provider>
        )
      } finally {
        renderDepth--
      }
    }

    function App() {
      renderDepth++
      try {
        return (
          <div id="wrapper">
            <Peer />
            <main data-slot="sidebar-inset" />
          </div>
        )
      } finally {
        renderDepth--
      }
    }

    const container = setup()
    const root = createRoot(container)
    flushSync(() => root.render(<App />))

    // Slots must be in source order.
    const slots = Array.from(container.querySelector('#wrapper')!.children).map(
      (c) => c.getAttribute('data-slot'),
    )
    expect(slots).toEqual(['sidebar', 'sidebar-inset'])

    // Ref must not have been called while any component was rendering.
    expect(refCallsDuringRender.every((d) => d === 0)).toBe(true)
  })
})

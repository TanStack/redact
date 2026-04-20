import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'

// Regression: when two renders happen back-to-back before the passive
// microtask drains, each render's useEffect should still cleanly tear down
// the prior side-effect and install the current one. Moving cleanup
// execution from dispatch-time to effect-run-time prevents coalesced renders
// from leaking side-effects (tanstack.com's NPM stats chart was appending a
// fresh Plot SVG every toggle without removing the previous one).

describe('useEffect cleanup under coalesced renders', () => {
  it('does not leak side-effects when two deps-changing renders coalesce before passive drain', async () => {
    const appended: Array<HTMLSpanElement> = []

    function Side({ label }: { label: string }) {
      const containerRef = React.useRef<HTMLDivElement>(null)
      React.useEffect(() => {
        if (!containerRef.current) return
        const span = document.createElement('span')
        span.dataset.label = label
        containerRef.current.appendChild(span)
        appended.push(span)
        return () => {
          span.remove()
        }
      }, [label])
      return <div ref={containerRef} data-host="1" />
    }

    function App({ label }: { label: string }) {
      return <Side label={label} />
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    // Initial mount — microtask drains so create runs and appends span #1.
    root.render(<App label="a" />)
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    expect(container.querySelectorAll('[data-host="1"] > span').length).toBe(1)

    // Two deps-changing renders back-to-back, synchronously — both schedule
    // effects before the passive microtask fires. Prior to the fix, the
    // cleanup ran once during the B dispatch, then C dispatch found
    // hook.cleanup already null (B's effect hadn't run yet), so both B's
    // and C's effects added spans with no cleanup between them → two spans.
    root.render(<App label="b" />)
    root.render(<App label="c" />)
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))

    // Only one live side-effect at any settled state.
    expect(container.querySelectorAll('[data-host="1"] > span').length).toBe(1)
  })

  it('still cleans up on unmount (no double-call when cleanup already ran)', async () => {
    let cleanupCalls = 0

    function Side({ label }: { label: string }) {
      React.useEffect(() => {
        return () => {
          cleanupCalls += 1
        }
      }, [label])
      return null
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    root.render(<Side label="a" />)
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))

    root.render(<Side label="b" />)
    root.render(<Side label="c" />)
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))

    // First cleanup (a→b) + second cleanup (b→c) should both run.
    expect(cleanupCalls).toBe(2)

    root.unmount()
    // Unmount should run the last live cleanup once (c's).
    expect(cleanupCalls).toBe(3)
  })
})

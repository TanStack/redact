import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as ReactDOM from 'react-dom'
import { flushSync } from 'react-dom'

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(() => r()))
const tick = async () => {
  for (let i = 0; i < 5; i++) await flushMicrotasks()
}

// Reproduces the t3code @tanstack/redact layout bug.
// When a top-level state change cascades down through a Provider that
// re-reconciles its children, each child gets the parent's `null` anchor
// (not its own getAnchor result). If one of those children's render output
// type changes (e.g. Sidebar swaps its rendered element from a Portal-
// rendering Sheet to an in-flow <div data-slot=sidebar>), the new host gets
// appended at the END of domParent. placeChildrenInOrder for the child
// fiber then sees doms[0].parentNode === domParent and bails on the
// in-order check — but the dom is at the wrong ABSOLUTE position
// relative to its later siblings. Net effect in t3code: chat content
// renders centered on the page instead of the content area, because the
// sidebar div ends up after the chat-inset main.
describe('placeChildrenInOrder: anchor-vs-absolute-position regression', () => {
  it('Sidebar Portal→div via Provider cascade: new div lands BEFORE chat', async () => {
    const container = setup()
    let setIsMobile!: (m: boolean) => void

    const portalContainer = document.createElement('div')
    document.body.appendChild(portalContainer)

    const Ctx = React.createContext<{ isMobile: boolean }>({ isMobile: false })

    function Sheet({ children }: { children: React.ReactNode }) {
      return ReactDOM.createPortal(<div>{children}</div>, portalContainer)
    }

    function Sidebar() {
      const { isMobile } = React.useContext(Ctx)
      if (isMobile)
        return (
          <Sheet>
            <span>M</span>
          </Sheet>
        )
      return <div data-slot="sidebar">D</div>
    }

    function ChatView() {
      return <main data-slot="sidebar-inset">CHAT</main>
    }

    // Provider is the one whose state flips, mirroring t3code's
    // SidebarProvider that calls useIsMobile() at the top level.
    function Provider({ children }: { children: React.ReactNode }) {
      const [isMobile, _setIsMobile] = React.useState(true)
      setIsMobile = _setIsMobile
      const value = React.useMemo(() => ({ isMobile }), [isMobile])
      return (
        <Ctx.Provider value={value}>
          <div data-slot="sidebar-wrapper">{children}</div>
        </Ctx.Provider>
      )
    }

    const root = createRoot(container)
    flushSync(() =>
      root.render(
        <Provider>
          <Sidebar />
          <ChatView />
        </Provider>,
      ),
    )
    await tick()

    let wrapper = container.querySelector('[data-slot="sidebar-wrapper"]')!
    let kids = Array.from(wrapper.children).map((c) => c.getAttribute('data-slot'))
    // Sheet portal'd elsewhere; only chat is in the wrapper
    expect(kids).toEqual(['sidebar-inset'])

    // Flip the Provider's state — cascades through children reconcile
    flushSync(() => setIsMobile(false))
    await tick()

    wrapper = container.querySelector('[data-slot="sidebar-wrapper"]')!
    kids = Array.from(wrapper.children).map((c) => c.getAttribute('data-slot'))
    // The bug (before fix): kids = ['sidebar-inset', 'sidebar']
    // After fix: kids = ['sidebar', 'sidebar-inset']
    expect(kids).toEqual(['sidebar', 'sidebar-inset'])
  })

  // Same bug, exercised through three siblings to confirm placement is
  // correct relative to ALL later siblings, not just the immediate next.
  it('first child swaps Portal→div with multiple later siblings', async () => {
    const container = setup()
    let setMode!: (m: 'portal' | 'inline') => void

    const portalContainer = document.createElement('div')
    document.body.appendChild(portalContainer)

    const Ctx = React.createContext<'portal' | 'inline'>('portal')

    function PortalChild() {
      return ReactDOM.createPortal(<div>P</div>, portalContainer)
    }

    function FirstChild() {
      const mode = React.useContext(Ctx)
      if (mode === 'portal') return <PortalChild />
      return <div data-slot="first">FIRST</div>
    }

    function Provider({ children }: { children: React.ReactNode }) {
      const [mode, _setMode] = React.useState<'portal' | 'inline'>('portal')
      setMode = _setMode
      return <Ctx.Provider value={mode}>{children}</Ctx.Provider>
    }

    const root = createRoot(container)
    flushSync(() =>
      root.render(
        <Provider>
          <div data-slot="parent">
            <FirstChild />
            <main data-slot="second">SECOND</main>
            <aside data-slot="third">THIRD</aside>
          </div>
        </Provider>,
      ),
    )
    await tick()

    let parent = container.querySelector('[data-slot="parent"]')!
    expect(Array.from(parent.children).map((c) => c.getAttribute('data-slot'))).toEqual([
      'second',
      'third',
    ])

    flushSync(() => setMode('inline'))
    await tick()

    parent = container.querySelector('[data-slot="parent"]')!
    expect(Array.from(parent.children).map((c) => c.getAttribute('data-slot'))).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  // Returning null and then a host element triggers the same code path:
  // FirstChild has no DOM initially, then gets a DOM that should land at
  // index 0.
  it('first child goes null→div via Provider cascade: new div at index 0', async () => {
    const container = setup()
    let show!: (b: boolean) => void

    const Ctx = React.createContext(false)

    function FirstChild() {
      const visible = React.useContext(Ctx)
      if (!visible) return null
      return <div data-slot="first">FIRST</div>
    }

    function Provider({ children }: { children: React.ReactNode }) {
      const [v, _show] = React.useState(false)
      show = _show
      return <Ctx.Provider value={v}>{children}</Ctx.Provider>
    }

    const root = createRoot(container)
    flushSync(() =>
      root.render(
        <Provider>
          <div data-slot="parent">
            <FirstChild />
            <main data-slot="second">SECOND</main>
          </div>
        </Provider>,
      ),
    )
    await tick()

    flushSync(() => show(true))
    await tick()

    const parent = container.querySelector('[data-slot="parent"]')!
    expect(Array.from(parent.children).map((c) => c.getAttribute('data-slot'))).toEqual([
      'first',
      'second',
    ])
  })

  // A child whose existing DOM stays (just toggled visibility) should not
  // get reordered — verify the new anchor check doesn't cause spurious
  // reattachments on stable re-renders.
  it('stable re-render does not reorder stable DOM', async () => {
    const container = setup()
    let bump!: () => void
    let attaches = 0

    function App() {
      const [, setN] = React.useState(0)
      bump = () => setN((n) => n + 1)
      return (
        <div data-slot="parent">
          <div data-slot="first">FIRST</div>
          <div data-slot="second">SECOND</div>
        </div>
      )
    }

    const root = createRoot(container)
    flushSync(() => root.render(<App />))
    await tick()

    const first = container.querySelector('[data-slot="first"]')!
    const second = container.querySelector('[data-slot="second"]')!

    // Listen for moves: any insertBefore that re-attaches our nodes counts
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of Array.from(m.addedNodes)) {
          if (n === first || n === second) attaches++
        }
      }
    })
    obs.observe(container.querySelector('[data-slot="parent"]')!, { childList: true })

    flushSync(() => bump())
    await tick()

    obs.disconnect()
    expect(attaches).toBe(0)
  })
})

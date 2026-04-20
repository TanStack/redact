import { FiberTag, createFiber, type FiberRoot, type ReactNode } from '@tanstack/dom-core'
import { renderRoot, flushSyncWork, batchedUpdates } from './reconcile'
import { beginHydration, endHydration } from './hydration'
import { drainReplayQueue } from './event-replay'

const GUARD_WINDOW_MS = 3000

function installHydrationScrollGuard(): void {
  const w = window as any
  if (w.__tdomScrollGuardInstalled) return
  w.__tdomScrollGuardInstalled = true
  const guardStartedAt = performance.now()
  let lastUserScrollAt = 0
  let programmatic = 0
  w.__tdomScrollLog = []
  window.addEventListener(
    'scroll',
    () => {
      if (programmatic === 0) {
        lastUserScrollAt = performance.now()
        w.__tdomScrollLog.push({ t: Math.round(lastUserScrollAt), ev: 'user-scroll', y: window.scrollY })
      }
    },
    { capture: true, passive: true },
  )
  const origScrollTo = window.scrollTo.bind(window)
  window.scrollTo = function (this: any, ...args: any[]) {
    const now = performance.now()
    const inGuardWindow = now - guardStartedAt < GUARD_WINDOW_MS
    const userScrolledRecently = lastUserScrollAt > 0 && now - lastUserScrollAt < 1500
    if (inGuardWindow && userScrolledRecently) {
      w.__tdomScrollLog.push({
        t: Math.round(now),
        ev: 'suppressed',
        args: JSON.stringify(args).slice(0, 80),
        tSinceHydrate: Math.round(now - guardStartedAt),
        tSinceUserScroll: Math.round(now - lastUserScrollAt),
      })
      return
    }
    w.__tdomScrollLog.push({
      t: Math.round(now),
      ev: 'allowed',
      args: JSON.stringify(args).slice(0, 80),
      tSinceHydrate: Math.round(now - guardStartedAt),
      inGuard: inGuardWindow,
      userScrolled: userScrolledRecently,
    })
    programmatic++
    try {
      return (origScrollTo as any).apply(this, args)
    } finally {
      queueMicrotask(() => {
        programmatic = Math.max(0, programmatic - 1)
      })
    }
  }
}

export interface RootOptions {
  identifierPrefix?: string
  onRecoverableError?: (error: unknown) => void
  onCaughtError?: (error: unknown) => void
  onUncaughtError?: (error: unknown) => void
}

export interface Root {
  render(children: ReactNode): void
  unmount(): void
}

export function createRoot(container: Element | DocumentFragment, options: RootOptions = {}): Root {
  const rootFiber = createFiber(FiberTag.Root, null, null)
  rootFiber.dom = container
  const root: FiberRoot = {
    container,
    current: rootFiber,
    pending: new Set(),
    scheduled: false,
    onRecoverableError: options.onRecoverableError,
    onCaughtError: options.onCaughtError,
    onUncaughtError: options.onUncaughtError,
    identifierPrefix: options.identifierPrefix ?? ':r',
    hydrating: false,
  }
  rootFiber.root = root
  rootFiber.stateNode = container

  return {
    render(children) {
      flushSyncWork(() => {
        renderRoot(root, children)
      })
    },
    unmount() {
      flushSyncWork(() => {
        renderRoot(root, null)
      })
    },
  }
}

export function hydrateRoot(
  container: Element | Document,
  initialChildren: ReactNode,
  options: RootOptions = {},
): Root {
  // `container` may be the Document when the React tree renders <html>...</html>
  // (e.g. TanStack Start's default client entry). In that case we adopt
  // documentElement as a CHILD of the root, not as the root itself — otherwise
  // we'd try to render <html> inside <html>.
  const target = container as any as Element | Document
  const rootFiber = createFiber(FiberTag.Root, null, null)
  rootFiber.dom = target as unknown as Node
  const root: FiberRoot = {
    container: target as any,
    current: rootFiber,
    pending: new Set(),
    scheduled: false,
    onRecoverableError: options.onRecoverableError,
    onCaughtError: options.onCaughtError,
    onUncaughtError: options.onUncaughtError,
    identifierPrefix: options.identifierPrefix ?? ':r',
    hydrating: false,
  }
  rootFiber.root = root
  rootFiber.stateNode = target

  // Preserve the user's scroll position across hydration. If the user scrolled
  // between SSR paint and hydrate (common in dev where JS takes seconds to
  // load), libraries that wire scroll-restoration into a `useLayoutEffect`
  // near the root (e.g. TanStack Router) will run during our synchronous
  // hydrate and call `window.scrollTo(savedFromLastVisit)` — overwriting the
  // user's fresh scroll. Snapshot scrollY before hydration; if hydration
  // changes it AND the snapshot was non-zero (a strong proxy for "user
  // scrolled", since `scrollRestoration = "manual"` is the common setup and
  // starts at 0), restore the snapshot. Falsy snapshots pass through so
  // legitimate restore-to-saved still works when the user didn't scroll.
  // User-scroll-wins guard. When the user scrolls between SSR paint and the
  // router's `useLayoutEffect` that invokes `window.scrollTo(savedOr0)`, the
  // user's active scroll gets clobbered. The effect often fires dozens of ms
  // AFTER our initial hydrate returns (subsequent `<Match>` mounts inside the
  // commit microtask tail), so a snapshot/restore around hydrate alone won't
  // catch it. Instead, during a short window after hydrate kicks off we track
  // user-initiated scroll events and suppress any programmatic `scrollTo`
  // that contradicts them. Programmatic scrolls initiated by our wrapper set
  // a suppression mark so the resulting scroll event isn't misread as user
  // input. Window is ~3s; after that the wrapper passes through.
  if (typeof window !== 'undefined') {
    installHydrationScrollGuard()
  }

  beginHydration(root)
  try {
    flushSyncWork(() => {
      renderRoot(root, initialChildren)
    })
  } finally {
    endHydration(root)
  }
  drainReplayQueue()

  return {
    render(children) {
      flushSyncWork(() => {
        renderRoot(root, children)
      })
    },
    unmount() {
      flushSyncWork(() => {
        renderRoot(root, null)
      })
    },
  }
}

export { flushSyncWork as flushSync, batchedUpdates }

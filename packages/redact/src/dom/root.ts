import { FiberTag, createFiber, type FiberRoot, type ReactNode } from '../core'
import { renderRoot, flushSyncWork, batchedUpdates } from './reconcile'
import {
  beginHydration,
  endHydration,
  drainReplayQueue,
  installHydrationScrollGuard,
} from './features/hydration'

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

  let firstRender = true
  return {
    render(children) {
      if (firstRender) {
        firstRender = false
        // Match real React's `clearContainer` semantics: blow away any pre-render
        // markup (server-rendered placeholder, splash shells, etc.) on the
        // initial commit so it doesn't stack with the React tree.
        if ((container as Node).nodeType === 1 /* ELEMENT_NODE */) {
          ;(container as Element).textContent = ''
        }
      }
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

  // Preserve the user's scroll position across hydration (see feature impl
  // for the details). No-op in SSR; no-op in the stub.
  installHydrationScrollGuard()

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

import type { ReactNode } from '../core'
import { renderRoot, flushSyncWork, batchedUpdates } from './reconcile'
import { hydrateRootImpl } from './features/hydration'
import { createFiberRoot } from './root-internal'

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
  const root = createFiberRoot(container, options)

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
  return hydrateRootImpl(container, initialChildren, options)
}

export { flushSyncWork as flushSync, batchedUpdates }

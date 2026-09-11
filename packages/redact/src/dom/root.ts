import type { ReactNode, RecoverableErrorHandler } from '../core'
import { renderRoot, scheduleRootRender, flushSyncWork, batchedUpdates } from './reconcile'
import { hydrateRootImpl } from './features/hydration'
import { createFiberRoot } from './root-internal'
import { queueMutation } from './commit'

export interface RootOptions {
  identifierPrefix?: string
  onRecoverableError?: RecoverableErrorHandler
  onCaughtError?: RecoverableErrorHandler
  onUncaughtError?: RecoverableErrorHandler
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
      scheduleRootRender(root, () => {
        if (firstRender) {
          queueMutation(() => {
            firstRender = false
            if ((container as Node).nodeType === 1) container.textContent = ''
          })
        }
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

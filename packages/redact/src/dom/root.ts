import { discardPendingWork, renderRoot, scheduleRootRender, flushSyncWork, batchedUpdates } from './reconcile'

import { createFiberRoot } from './root-internal'

import { queueMutation } from './commit'
import { clearHostContainer } from './document-metadata'

import { hydrateRootImpl } from './features/hydration'

import type { ReactNode, RecoverableErrorHandler } from '../core'

export interface RootOptions {
  formState?: unknown[] | null
  identifierStrategy?: 'react'
  identifierPrefix?: string
  onRecoverableError?: RecoverableErrorHandler
  onCaughtError?: RecoverableErrorHandler
  onUncaughtError?: RecoverableErrorHandler
}

export interface Root {
  render(children: ReactNode): void
  unmount(): void
}

export function createRoot(container: Element | DocumentFragment | Document, options: RootOptions = {}): Root {
  const root = createFiberRoot(container, options)

  let firstRender = true
  return {
    render(children) {
      scheduleRootRender(root, () => {
        if (firstRender) {
          queueMutation(() => {
            firstRender = false
            if (container.nodeType === 1 || container.nodeType === 9) clearHostContainer(container)
          })
        }
        renderRoot(root, children)
      })
    },
    unmount() {
      discardPendingWork(root)
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

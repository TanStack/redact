import { clientReactId } from '../../react-ids'
import type { Fiber, FiberRoot } from '../../../core'

// Stub: Hydration feature disabled. Every adoption attempt returns "no match",
// all cursor operations no-op, and `beginHydration` throws so `hydrateRoot`
// fails loudly — apps that opt out of hydration should use `createRoot`.
// The SSR walk-the-DOM machinery, streaming-boundary coordination, head
// element matching, and the WeakMap of cursors per fiber are all stripped.

export class HydrationCursor {
  n: ChildNode | null = null
  p: Node
  e: ChildNode | null = null
  constructor(parent?: Node, _s?: ChildNode | null, _e?: ChildNode | null) {
    this.p = parent as Node
  }
  take(): ChildNode | null {
    return null
  }
  head(): ChildNode | null {
    return null
  }
  has(): boolean {
    return false
  }
}

export type BoundaryInfo = [0 | 1 | 2 | 3, number, Comment, Comment]

export function beginHydration(_root: FiberRoot): never {
  throw new Error(
    process.env.NODE_ENV !== 'production' ? '`hydrateRoot` requires the `hydration` feature. ' +
      'Enable it via @tanstack/redact/vite `features.hydration = true`, ' +
      'or use `createRoot` for a SPA (no SSR hydration).' : '',
  )
}

export function endHydration(_root: FiberRoot): void {}

export const queueHydrationEnd = undefined

export const tryConsumeBoundary = (_parent: Fiber): BoundaryInfo | null => (null)

export function advanceCursorPast(_parent: Fiber, _node: Node): void {}

export const getHydrationCursor = (_hostFiber: Fiber): HydrationCursor | undefined => (undefined)

export function setHydrationCursor(_hostFiber: Fiber, _cursor: HydrationCursor): void {}

export function clearHydrationCursor(_hostFiber: Fiber): void {}

export function resumeHydration(_f: Fiber, _root: FiberRoot): (() => void) | undefined { return undefined }

export const adoptHostDom: (_f: Fiber, _parent: Fiber) => boolean = () => false

export const adoptTextDom: (_f: Fiber, _parent: Fiber, _text: string) => boolean = () => false

export const findHostParent = (fiber: Fiber): Fiber => (fiber)

export function drainReplayQueue(): void {}


export interface HydrationBailoutError extends Error {
  f: Fiber | null
}

export function isHydrationBailout(_error: unknown): _error is HydrationBailoutError
export function isHydrationBailout(): boolean { return false }

export const recoverHydration: (_root: FiberRoot, _error: unknown) => boolean = () => false

// No hydration recovery exists in this preset, so preserve the original error.
export function abortHydration(cause: unknown, _fiber?: Fiber | null): never {
  throw cause
}

export const hydrateRootImpl = beginHydration

export const reactId = (_f: Fiber, root: FiberRoot): string => (clientReactId(root))
export const forkId: (base: bigint, _count: number, _index: number) => bigint = base => base

export function assignReactIds(_parent: Fiber, _children: object): void {}

export const deferHydration: (_f: Fiber, _thenable: Promise<any>) => boolean = () => false

export function finishHydration(_f: Fiber, _isTextarea: boolean): void {}

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

export type BoundaryInfo = [0 | 1, number, Comment, Comment]

export function beginHydration(_root: FiberRoot): void {
  throw new Error(
    '`hydrateRoot` requires the `hydration` feature. ' +
      'Enable it via @tanstack/redact/vite `features.hydration = true`, ' +
      'or use `createRoot` for a SPA (no SSR hydration).',
  )
}

export function endHydration(_root: FiberRoot): void {}

export function tryConsumeBoundary(_parent: Fiber): BoundaryInfo | null {
  return null
}

export function advanceCursorPast(_parent: Fiber, _node: Node): void {}

export function getHydrationCursor(_hostFiber: Fiber): HydrationCursor | undefined {
  return undefined
}

export function setHydrationCursor(_hostFiber: Fiber, _cursor: HydrationCursor): void {}

export function clearHydrationCursor(_hostFiber: Fiber): void {}

export function adoptHostDom(_fiber: Fiber, _parent: Fiber): boolean {
  return false
}

export function adoptTextDom(_fiber: Fiber, _parent: Fiber, _text: string): boolean {
  return false
}

export function findHostParent(fiber: Fiber): Fiber {
  return fiber
}

export function installHydrationScrollGuard(): void {}

export function drainReplayQueue(): void {}

export interface HydrationBailoutError extends Error {
  f: Fiber | null
}

export function isHydrationBailout(_error: unknown): _error is HydrationBailoutError {
  return false
}

export function recoverHydration(_root: FiberRoot, _error: unknown): boolean {
  return false
}

export function abortHydration(cause: unknown, fiber: Fiber | null = null): never {
  const error = (cause instanceof Error ? cause : new Error('Hydration mismatch.')) as HydrationBailoutError
  ;(error as any).f = fiber
  throw error
}

export function hydrateRootImpl(): never {
  beginHydration(null as any)
  throw new Error('`hydrateRoot` requires the `hydration` feature.')
}

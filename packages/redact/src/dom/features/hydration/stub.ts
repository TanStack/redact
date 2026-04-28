import type { Fiber, FiberRoot } from '../../../core'

// Stub: Hydration feature disabled. Every adoption attempt returns "no match",
// all cursor operations no-op, and `beginHydration` throws so `hydrateRoot`
// fails loudly — apps that opt out of hydration should use `createRoot`.
// The SSR walk-the-DOM machinery, streaming-boundary coordination, head
// element matching, and the WeakMap of cursors per fiber are all stripped.

export class HydrationCursor {
  next: ChildNode | null = null
  parent: Node
  endBefore: ChildNode | null = null
  constructor(parent?: Node, _s?: ChildNode | null, _e?: ChildNode | null) {
    this.parent = parent as Node
  }
  takeHostNode(): ChildNode | null {
    return null
  }
  takeMatchingHeadElement(): ChildNode | null {
    return null
  }
  remaining(): ChildNode[] {
    return []
  }
}

export interface BoundaryInfo {
  kind: 'pending' | 'resolved'
  id: number
  startMark: Comment
  endMark: Comment
}

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

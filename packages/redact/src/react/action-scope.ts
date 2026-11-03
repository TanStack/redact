import type { FiberRoot } from '../core'
import { ReactSharedInternals } from './shared-internals'
import { isThenable } from '../core/functions'
// Action lifetimes are separate from transition types used by ViewTransition.
export interface ActionScope {
  o?: FiberRoot | null | undefined
  v?: number
  n?: ((scope: ActionScope) => void) | undefined
  p: number
  d: Promise<void>
  r: () => void
  e?: unknown
  h?: boolean
  f: boolean
  l: Set<() => void>
}

export function trackAction(scope: ActionScope, promise: PromiseLike<unknown>, nested?: ActionScope): void {
  scope.p++
  Promise.resolve(promise).then(() => {
    if (nested?.f) { scope.e = nested.e; scope.f = true }
    finish(scope)
  }, error => {
    scope.e = error
    scope.f = true
    finish(scope)
  })
}
export function finish(scope: ActionScope): void {
  if (--scope.p !== 0) return
  for (const listener of scope.l) listener()
  scope.l.clear()
  scope.r()
}
export function runAction(callback: () => unknown, owner?: FiberRoot | null, notify?: (scope: ActionScope) => void): ActionScope {
  const previous = ReactSharedInternals.B
  let resolve!: () => void
  const done = new Promise<void>(yes => { resolve = yes })
  const scope: ActionScope = { p: 1, d: done, r: resolve, f: false, l: new Set(), o: owner ?? previous?.o, n: notify }
  try {
    const result = withinAction(scope, callback)
    if (isThenable(result)) trackAction(scope, result as PromiseLike<unknown>)
  } catch (error) {
    scope.f = true
    scope.e = error
  } finally {
    finish(scope)
  }
  if (previous && scope.p > 0) trackAction(previous, done, scope)
  return scope
}

export function withinAction<T>(scope: ActionScope | null | undefined, callback: () => T): T {
  const previous = ReactSharedInternals.B
  ReactSharedInternals.B = scope
  try { return callback() } finally { ReactSharedInternals.B = previous }
}

import { ReactSharedInternals, REACT_CONTEXT_TYPE } from '../react'

interface SSRFrame {
  idCounter: number
  identifierPrefix: string
  contextStack: Array<{ context: any; prev: any }>
}

let frame: SSRFrame | null = null

export function beginSSR(identifierPrefix = ':R'): void {
  frame = { idCounter: 0, identifierPrefix, contextStack: [] }
}

export function endSSR(): void {
  // Restore any remaining pushed contexts (defensive)
  if (frame) {
    for (let i = frame.contextStack.length - 1; i >= 0; i--) {
      const { context, prev } = frame.contextStack[i]!
      context._currentValue = prev
    }
  }
  frame = null
}

export function pushContext(context: any, value: any): void {
  if (!frame) throw new Error('pushContext called outside SSR')
  frame.contextStack.push({ context, prev: context._currentValue })
  context._currentValue = value
}

export function popContext(context: any): void {
  if (!frame) return
  const top = frame.contextStack.pop()
  if (top && top.context === context) context._currentValue = top.prev
}

export type ContextSnapshot = Array<{ context: any; value: any }>

export function snapshotContexts(): ContextSnapshot {
  if (!frame) return []
  const out: ContextSnapshot = []
  for (const entry of frame.contextStack) {
    out.push({ context: entry.context, value: entry.context._currentValue })
  }
  return out
}

/**
 * Push snapshot values and return a function that pops them.
 * Called when we re-render a suspended boundary so it sees the same provider
 * values that were active at suspension time.
 */
export function applyContextSnapshot(snapshot: ContextSnapshot): () => void {
  for (const { context, value } of snapshot) pushContext(context, value)
  return () => {
    for (let i = snapshot.length - 1; i >= 0; i--) popContext(snapshot[i]!.context)
  }
}

export const ssrDispatcher = {
  useState<S>(initial: S | (() => S)) {
    const v = typeof initial === 'function' ? (initial as () => S)() : initial
    return [v, (() => {}) as any] as [S, any]
  },
  useReducer<S, A>(_reducer: (s: S, a: A) => S, initialArg: any, init?: (a: any) => S) {
    const v = init ? init(initialArg) : initialArg
    return [v, (() => {}) as any]
  },
  useEffect() {
    // noop on server
  },
  useLayoutEffect() {
    // noop on server
  },
  useInsertionEffect() {
    // noop on server
  },
  useRef<T>(initial: T) {
    return { current: initial }
  },
  useMemo<T>(factory: () => T) {
    return factory()
  },
  useCallback<T extends Function>(fn: T) {
    return fn
  },
  useContext<T>(ctx: any): T {
    return ctx._currentValue
  },
  useImperativeHandle() {
    // noop on server
  },
  useDebugValue() {
    // noop
  },
  useId(): string {
    if (!frame) return ':r0:'
    return `${frame.identifierPrefix}${(frame.idCounter++).toString(36)}`
  },
  useTransition(): [boolean, (fn: () => void) => void] {
    return [false, (fn) => fn()]
  },
  useDeferredValue<T>(v: T): T {
    return v
  },
  useSyncExternalStore<T>(
    _subscribe: (cb: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ): T {
    return getServerSnapshot ? getServerSnapshot() : getSnapshot()
  },
  use<T>(resource: any): T {
    if (resource == null) throw new Error('use() received null or undefined')
    if (resource.$$typeof === REACT_CONTEXT_TYPE) {
      return resource._currentValue
    }
    if (typeof resource.then === 'function') {
      const thenable = resource
      switch (thenable.status) {
        case 'fulfilled':
          return thenable.value
        case 'rejected':
          throw thenable.reason
        default: {
          if (thenable.status === undefined) {
            thenable.status = 'pending'
            thenable.then(
              (v: any) => {
                if (thenable.status === 'pending') {
                  thenable.status = 'fulfilled'
                  thenable.value = v
                }
              },
              (e: any) => {
                if (thenable.status === 'pending') {
                  thenable.status = 'rejected'
                  thenable.reason = e
                }
              },
            )
          }
          throw thenable
        }
      }
    }
    throw new Error('use() expected a Promise or Context')
  },
}

export function installSSRDispatcher(): void {
  ReactSharedInternals.H = ssrDispatcher as any
}

export function uninstallSSRDispatcher(): void {
  ReactSharedInternals.H = null
}

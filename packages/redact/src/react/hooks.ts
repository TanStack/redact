import { isThenable, isFunction } from '../core/functions'
import type {
  Dispatch,
  SetStateAction,
  EffectCallback,
  DependencyList,
} from '../core'
import type { Context } from './context'
import { getDispatcher, ReactSharedInternals } from './shared-internals'

import type { BrowserToken } from '../core/browser'

export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>]
export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>]
export function useState<S>(initial?: S | (() => S)): [S | undefined, Dispatch<SetStateAction<S | undefined>>] {
  return getDispatcher().useState(initial)
}

export function useReducer<S, A>(
  reducer: (s: S, a: A) => S,
  initial: any,
  init?: (a: any) => S,
): [S, Dispatch<A>] {
  return getDispatcher().useReducer(reducer, initial, init)
}

export function useEffect(create: EffectCallback, deps?: DependencyList): void {
  getDispatcher().useEffect(create, deps)
}

export function useLayoutEffect(create: EffectCallback, deps?: DependencyList): void {
  getDispatcher().useLayoutEffect(create, deps)
}

export function useInsertionEffect(create: EffectCallback, deps?: DependencyList): void {
  getDispatcher().useInsertionEffect(create, deps)
}

export function useRef<T>(initial: T): { current: T }
export function useRef<T>(initial: T | null): { current: T | null }
export function useRef<T = undefined>(): { current: T | undefined }
export function useRef(initial?: any): { current: any } {
  return getDispatcher().useRef(initial)
}

export function useMemo<T>(factory: () => T, deps?: DependencyList): T {
  return getDispatcher().useMemo(factory, deps)
}

export function useCallback<T extends Function>(fn: T, deps?: DependencyList): T {
  return getDispatcher().useCallback(fn, deps)
}

export function useContext<T>(ctx: Context<T>): T {
  return getDispatcher().useContext(ctx)
}

export function useImperativeHandle<T>(
  ref: any,
  factory: () => T,
  deps?: DependencyList,
): void {
  getDispatcher().useImperativeHandle(ref, factory, deps)
}

export function useDebugValue<T>(value: T, formatter?: (v: T) => any): void {
  getDispatcher().useDebugValue(value, formatter)
}

export function useId(): string {
  return getDispatcher().useId()
}

export function useTransition(): [boolean, (fn: () => void) => void] {
  return getDispatcher().useTransition()
}

export function useDeferredValue<T>(v: T): T {
  return getDispatcher().useDeferredValue(v)
}

export function useSyncExternalStore<T>(
  subscribe: (cb: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T,
): T {
  return getDispatcher().useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function use(resource: BrowserToken): undefined
export function use<T>(resource: PromiseLike<T> | { _currentValue: T } | { $$typeof: symbol; _currentValue: T }): T
export function use<T>(resource: BrowserToken | PromiseLike<T> | { _currentValue: T } | { $$typeof: symbol; _currentValue: T }): T {
  return getDispatcher().use(resource)
}

export function unstable_useCacheRefresh(): () => void {
  return getDispatcher().useCacheRefresh()
}

export function transitionScope<T>(fn: () => T): T {
  const previous = ReactSharedInternals.T
  ReactSharedInternals.T = previous || new Set()
  try { return fn() } finally { ReactSharedInternals.T = previous }
}

export function reportActionError(error: unknown): void {
  if (isFunction(globalThis.reportError)) globalThis.reportError(error)
  else setTimeout(() => { throw error })
}

export function startTransition(fn: () => void): void {
  try {
    const result = transitionScope(() => ReactSharedInternals.X ? ReactSharedInternals.X(fn) : fn())
    if (isThenable(result)) result.then(undefined, reportActionError)
  } catch (error) { reportActionError(error) }
}

export function useActionState<S>(
  action: (state: Awaited<S>) => S | Promise<S>,
  initial: Awaited<S>,
  permalink?: string,
): [Awaited<S>, () => void, boolean]
export function useActionState<S, P>(
  action: (state: Awaited<S>, payload: P) => S | Promise<S>,
  initial: Awaited<S>,
  permalink?: string,
): [Awaited<S>, (payload: P) => void, boolean]
export function useActionState<S, P>(
  action: (state: Awaited<S>, payload: P) => S | Promise<S>,
  initial: Awaited<S>,
  _permalink?: string,
): [Awaited<S>, (payload: P) => void, boolean] {
  return getDispatcher().useActionState(action, initial, _permalink)
}

export function useFormStatus() {
  if (process.env.NODE_ENV !== 'production') {
    const debug = (ReactSharedInternals.H as any)?.useHostTransitionStatus
    if (debug) return debug()
  }
  return getDispatcher().useFormStatus()
}

export function useOptimistic<S, A = S>(
  state: S,
  updateFn?: (s: S, a: A) => S,
): [S, (action: A) => void] {
  return getDispatcher().useOptimistic(state, updateFn)
}

// Composed hook — returns a stable callback that always invokes the latest
// `fn`. The ref is updated in useInsertionEffect so any useLayoutEffect /
// useEffect reading ref.current in the next commit sees the fresh function.
export function useEffectEvent<Args extends unknown[], Return>(
  fn: (...args: Args) => Return,
): (...args: Args) => Return {
  if (process.env.NODE_ENV !== 'production') {
    const debug = (ReactSharedInternals.H as any)?.useEffectEvent
    if (debug) return debug(fn)
  }
  const ref = useRef(fn)
  useInsertionEffect(() => {
    ref.current = fn
  })
  return useCallback(
    ((...args: Args) => ref.current(...args)) as (...args: Args) => Return,
    [],
  )
}

// `useSyncExternalStoreWithSelector` — provided here so consumers (like
// @tanstack/react-store) that historically import from
// `use-sync-external-store/shim/with-selector` can be aliased to this
// package via the @tanstack/redact/vite plugin. The CJS shim is unsuitable
// for Cloudflare Workers (it does `var React = require('react')` which
// fails in workerd). Implementation matches React's reference impl —
// selector + isEqual gate to avoid re-renders when the selected slice is
// unchanged across snapshots.
export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (cb: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: (() => Snapshot) | undefined,
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean,
): Selection {
  const committed = useRef<{ value: Selection } | null>(null)
  const [getSelection, getServerSelection] = useMemo(() => {
    let ready = false
    let snapshot: Snapshot
    let selection: Selection
    const select = (next: Snapshot): Selection => {
      if (ready && Object.is(snapshot, next)) return selection
      let value = selector(next)
      if ((ready || committed.current) && isEqual?.(ready ? selection : committed.current!.value, value)) {
        value = ready ? selection : committed.current!.value
      }
      ready = true
      snapshot = next
      return selection = value
    }
    return [
      () => select(getSnapshot()),
      getServerSnapshot && (() => select(getServerSnapshot())),
    ] as const
  }, [getSnapshot, getServerSnapshot, selector, isEqual])

  const value = useSyncExternalStore(subscribe, getSelection, getServerSelection)
  useDebugValue(value)
  useLayoutEffect(() => {
    if (committed.current) committed.current.value = value
    else committed.current = { value }
  }, [value])
  return value
}

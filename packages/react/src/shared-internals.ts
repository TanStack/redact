import type { Fiber, FiberRoot, Hook } from '@tanstack/dom-core'

export interface Dispatcher {
  useState<S>(initial: S | (() => S)): [S, (s: S | ((p: S) => S)) => void]
  useReducer<S, A>(
    reducer: (s: S, a: A) => S,
    initial: S | any,
    init?: (a: any) => S,
  ): [S, (a: A) => void]
  useEffect(create: () => any, deps?: ReadonlyArray<unknown>): void
  useLayoutEffect(create: () => any, deps?: ReadonlyArray<unknown>): void
  useInsertionEffect(create: () => any, deps?: ReadonlyArray<unknown>): void
  useRef<T>(initial: T): { current: T }
  useMemo<T>(factory: () => T, deps?: ReadonlyArray<unknown>): T
  useCallback<T extends Function>(fn: T, deps?: ReadonlyArray<unknown>): T
  useContext<T>(ctx: any): T
  useImperativeHandle<T>(ref: any, factory: () => T, deps?: ReadonlyArray<unknown>): void
  useDebugValue<T>(value: T, formatter?: (v: T) => any): void
  useId(): string
  useTransition(): [boolean, (fn: () => void) => void]
  useDeferredValue<T>(v: T): T
  useSyncExternalStore<T>(
    subscribe: (cb: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ): T
  use<T>(promiseOrContext: any): T
}

interface SharedInternals {
  H: Dispatcher | null
  T: any
  S: ((fn: () => void) => void) | null
  currentFiber: Fiber | null
  currentRoot: FiberRoot | null
  currentHook: Hook | null
  hookIndex: number
}

export const ReactSharedInternals: SharedInternals = {
  H: null,
  T: null,
  S: null,
  currentFiber: null,
  currentRoot: null,
  currentHook: null,
  hookIndex: 0,
}

export function getDispatcher(): Dispatcher {
  const d = ReactSharedInternals.H
  if (!d) throw new Error('Hooks can only be called inside a function component.')
  return d
}

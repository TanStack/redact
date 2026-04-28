import type { Fiber, FiberRoot, Hook } from '../core'

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

// Stash the singleton on `globalThis` under a registered symbol. Module-scoped
// state goes wrong fast in environments that end up with multiple copies of
// `@tanstack/redact` in flight — most notably Cloudflare's `vite-plugin` dev
// mode, where the worker entry inlines `@tanstack/redact` once via `noExternal`
// while user code reaches a separate pre-bundled `deps_ssr/redact.js` copy.
// Each copy would otherwise have its own `ReactSharedInternals.H`, so the SSR
// dispatcher installed by one would be invisible to hooks called through the
// other and `useContext` would explode with "Hooks can only be called inside a
// function component". `Symbol.for` survives module re-evaluation and isolate
// boundaries, giving every copy the same backing object.
const KEY = Symbol.for('@tanstack/redact.ReactSharedInternals')
const g = globalThis as unknown as { [k: symbol]: SharedInternals | undefined }

export const ReactSharedInternals: SharedInternals =
  g[KEY] ??
  (g[KEY] = {
    H: null,
    T: null,
    S: null,
    currentFiber: null,
    currentRoot: null,
    currentHook: null,
    hookIndex: 0,
  })

export function getDispatcher(): Dispatcher {
  const d = ReactSharedInternals.H
  if (!d) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'Hooks can only be called inside a function component. ' +
          'If this fires during SSR/RSC, the most common cause is a component that uses client-only hooks ' +
          '(useState, useContext, useRouter, etc.) being rendered in the RSC server environment without a ' +
          '"use client" directive at the top of its file.',
      )
    }
    throw new Error('Hooks can only be called inside a function component.')
  }
  return d
}

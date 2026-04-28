import type {
  Dispatch,
  SetStateAction,
  EffectCallback,
  DependencyList,
} from '../core'
import type { Context } from './context'
import { getDispatcher } from './shared-internals'

export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>] {
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

export function use<T>(resource: any): T {
  return getDispatcher().use(resource)
}

export function startTransition(fn: () => void): void {
  fn()
}

export function useActionState<S, P>(
  _action: (state: Awaited<S>, payload: P) => S | Promise<S>,
  initial: Awaited<S>,
): [Awaited<S>, (payload: P) => void, boolean] {
  return [initial, () => {}, false]
}

export function useFormStatus() {
  return { pending: false, data: null, method: null, action: null }
}

export function useOptimistic<S, A = S>(
  state: S,
  _updateFn?: (s: S, a: A) => S,
): [S, (action: A) => void] {
  return [state, () => {}]
}

// Composed hook — returns a stable callback that always invokes the latest
// `fn`. The ref is updated in useInsertionEffect so any useLayoutEffect /
// useEffect reading ref.current in the next commit sees the fresh function.
export function useEffectEvent<Args extends unknown[], Return>(
  fn: (...args: Args) => Return,
): (...args: Args) => Return {
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
  const instRef = useRef<{ hasValue: boolean; value: Selection | null } | null>(null)
  let inst: { hasValue: boolean; value: Selection | null }
  if (instRef.current === null) {
    inst = { hasValue: false, value: null }
    instRef.current = inst
  } else {
    inst = instRef.current
  }

  const [getSelection, getServerSelection] = useMemo(() => {
    let hasMemo = false
    let memoizedSnapshot: Snapshot
    let memoizedSelection: Selection
    const memoizedSelector = (nextSnapshot: Snapshot): Selection => {
      if (!hasMemo) {
        hasMemo = true
        memoizedSnapshot = nextSnapshot
        const nextSelection = selector(nextSnapshot)
        if (isEqual !== undefined && inst.hasValue) {
          const currentSelection = inst.value as Selection
          if (isEqual(currentSelection, nextSelection)) {
            memoizedSelection = currentSelection
            return currentSelection
          }
        }
        memoizedSelection = nextSelection
        return nextSelection
      }
      const prevSnapshot: Snapshot = memoizedSnapshot
      const prevSelection: Selection = memoizedSelection
      if (Object.is(prevSnapshot, nextSnapshot)) return prevSelection
      const nextSelection = selector(nextSnapshot)
      if (isEqual !== undefined && isEqual(prevSelection, nextSelection)) return prevSelection
      memoizedSnapshot = nextSnapshot
      memoizedSelection = nextSelection
      return nextSelection
    }
    const get = () => memoizedSelector(getSnapshot())
    const getServer =
      getServerSnapshot === undefined ? undefined : () => memoizedSelector(getServerSnapshot())
    return [get, getServer] as const
  }, [getSnapshot, getServerSnapshot, selector, isEqual])

  const value = useSyncExternalStore(subscribe, getSelection, getServerSelection)
  useDebugValue(value)
  inst.hasValue = true
  inst.value = value
  return value
}

import type {
  Dispatch,
  SetStateAction,
  EffectCallback,
  DependencyList,
  Context,
} from '@tanstack/dom-core'
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

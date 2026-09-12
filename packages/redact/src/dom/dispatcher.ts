import type { Hook, Fiber, FiberRoot, Effect, ReactNode } from '../core'
import { ReactSharedInternals, REACT_CONTEXT_TYPE, startTransition } from '../react'
import { scheduleUpdate, enqueueEffect, readContext, rememberActivityEffect, handleCommitError } from './reconcile'
import { REACT_RECOVERABLE_TYPE } from '../core/browser'
import { queueCommitEffects } from './commit'
import { deferTransitionPassive } from './features/view-transition'

function getCurrentFiber(): Fiber {
  const f = ReactSharedInternals.F
  if (!f) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error('Hook called outside a function component render.')
    }
    throw new Error()
  }
  return f
}

function nextHook(): Hook {
  const hooks = getCurrentFiber().hooks ||= []
  const index = ReactSharedInternals.I++
  return hooks[index] ||= { s: undefined, q: undefined, d: undefined, c: undefined }
}

function depsEqual(
  a: ReadonlyArray<unknown> | undefined,
  b: ReadonlyArray<unknown> | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false
  }
  return true
}

type BasicStateAction<S> = S | ((p: S) => S)

function initializeReducer(hook: Hook, fiber: Fiber, initialArg: any, init?: (arg: any) => any): void {
  hook.s = hook.d = init ? init(initialArg) : initialArg
  hook.c = null
  hook.q = (action: any) => {
    if (fiber.um || fiber.pd) return
    ;(hook.c ||= []).push(action)
    scheduleUpdate(fiber)
  }
}

// Reducer slots reuse the effect-cleanup field for pending actions. Zero marks
// eager state work, null means no update. Replacing arrays lets retries restore
// pending actions without copying or shifting them.
// State and reducer slots keep their last rendered value in d, even undefined.
function reducePending(hook: Hook, reducer: (state: any, action: any) => any): void {
  const actions = hook.c
  if (actions == null) return
  hook.c = null
  let state = hook.s
  if (actions) for (const action of actions) state = reducer(state, action)
  hookFlags |= Object.is(state, hook.d) ? 2 : 3
  hook.s = hook.d = state
}

let hookEffects: any[] | undefined
// Bit 1 records a changed value; bit 2 records a processed reducer queue.
let hookFlags = 0
export const HOOK_BAILOUT = Symbol()

function resetHookEffects(effects: any[]): void {
  for (let index = 0; index < effects.length; index += 4) effects[index].d = effects[index + 1]
}

export function renderWithHooks(
  fiber: Fiber,
  render: (props: any, ref?: any) => ReactNode,
  props: any,
  ref?: any,
  canBail = false,
): ReactNode | typeof HOOK_BAILOUT {
  const previousDispatcher = ReactSharedInternals.H, previousFiber = ReactSharedInternals.F, previousIndex = ReactSharedInternals.I
  const previousEffects = hookEffects, previousFlags = hookFlags
  hookEffects = undefined
  hookFlags = 0
  ReactSharedInternals.H = DISPATCHER
  ReactSharedInternals.F = fiber
  try {
    let rendered: ReactNode, attempts = 0
    do {
      if (++attempts > 25) throw new Error(process.env.NODE_ENV !== 'production' ? 'Too many re-renders.' : '')
      if (hookEffects) {
        resetHookEffects(hookEffects)
        hookEffects = undefined
      }
      ReactSharedInternals.I = 0
      fiber.dy = false
      rendered = render(props, ref)
    } while (fiber.dy)
    if (canBail && hookFlags === 2) {
      // React accepts the rendered dependencies on a reducer bailout, but
      // keeps the previous committed effect descriptions until real work.
      hookEffects = undefined
      return HOOK_BAILOUT
    }
    if (hookEffects) {
      const effects: any[] = hookEffects
      for (let index = 0; index < effects.length; index += 4) {
        const hook = effects[index], effect = effects[index + 2]
        rememberActivityEffect(fiber, hook, effect)
        if (effects[index + 3]) enqueueEffect(fiber, effect)
      }
      hookEffects = undefined
    }
    return rendered
  } finally {
    if (hookEffects) resetHookEffects(hookEffects)
    hookEffects = previousEffects
    hookFlags = previousFlags
    ReactSharedInternals.H = previousDispatcher
    ReactSharedInternals.F = previousFiber
    ReactSharedInternals.I = previousIndex
  }
}

export function cleanupEffect(hook: Hook, fiber: Fiber): void {
  if (!hook.c) return
  const cleanup = hook.c
  hook.c = null
  if (fiber.cu) {
    const index = fiber.cu.indexOf(cleanup)
    if (index >= 0) fiber.cu.splice(index, 1)
  }
  try { cleanup() } catch (error) { handleCommitError(fiber, error) }
}

function useEffectImpl(type: Effect['t'], create: () => any, deps?: ReadonlyArray<unknown>): void {
  const hook = nextHook()
  const fiber = getCurrentFiber()
  const changed = hook.d === undefined || !depsEqual(hook.d, deps)
  if (!changed && !fiber.root?.a && !(type === 1 && fiber.root?.sp)) return
  const previous = hook.d
  hook.d = deps
  const effect: Effect = {
    t: type,
    c: () => {
      cleanupEffect(hook, fiber)
      const cleanup = create()
      // Each effect owns its cleanup even when hooks return the same function.
      hook.c = typeof cleanup === 'function' ? () => {
        if (type === 0) {
          const dispose = () => {
            try { cleanup() } catch (error) { handleCommitError(fiber, error) }
          }
          if (!deferTransitionPassive(dispose)) queueCommitEffects(dispose)
        } else cleanup()
      } : null
      return hook.c
    },
  }
  if (type === 1) effect.d = () => cleanupEffect(hook, fiber)
  ;(hookEffects ||= []).push(hook, previous, effect, changed)
}

// Singleton — every method reads render context via ReactSharedInternals,
// and per-hook closures live on the hook itself, so nothing is render-local
// to capture. Allocating a fresh wrapper + 17 method closures per function-
// component render was pure GC pressure.
const DISPATCHER = makeDispatcherImpl()

function makeDispatcherImpl() {
  return {
    useState<S>(initial: S | (() => S)): [S, (a: BasicStateAction<S>) => void] {
      const hook = nextHook(), fiber = getCurrentFiber()
      if (hook.q === undefined) {
        hook.s = hook.d = typeof initial === 'function' ? (initial as () => S)() : initial
        hook.c = null
        hook.q = (action: BasicStateAction<S>) => {
          if (fiber.um || fiber.pd) return
          if (ReactSharedInternals.F !== fiber && !hook.c) {
            let next: S
            try {
              next = basicReducer(hook.s, action)
            } catch {
              hook.c = [action]
              scheduleUpdate(fiber)
              return
            }
            if (Object.is(next, hook.s)) return
            hook.s = next
            hook.c = 0
            scheduleUpdate(fiber)
            return
          }
          ;(hook.c ||= []).push(action)
          scheduleUpdate(fiber)
        }
      }
      reducePending(hook, basicReducer)
      return [hook.s, hook.q]
    },

    useReducer<S, A>(reducer: (s: S, a: A) => S, initialArg: any, init?: (a: any) => S) {
      const hook = nextHook()
      if (hook.q === undefined) initializeReducer(hook, getCurrentFiber(), initialArg, init)
      reducePending(hook, reducer)
      return [hook.s, hook.q] as [S, (a: A) => void]
    },

    useEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
      useEffectImpl(0, create, deps)
    },

    useLayoutEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
      useEffectImpl(1, create, deps)
    },

    useInsertionEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
      useEffectImpl(2, create, deps)
    },

    useRef<T>(initial: T) {
      const hook = nextHook()
      if (hook.s === undefined) hook.s = { current: initial }
      return hook.s as { current: T }
    },

    useMemo<T>(factory: () => T, deps?: ReadonlyArray<unknown>) {
      const hook = nextHook()
      if (hook.d !== undefined && depsEqual(hook.d, deps)) {
        return hook.s as T
      }
      const value = factory()
      hook.s = value
      hook.d = deps
      return value
    },

    useCallback<T extends Function>(fn: T, deps?: ReadonlyArray<unknown>): T {
      return this.useMemo(() => fn, deps) as T
    },

    useContext<T>(ctx: any): T {
      const fiber = getCurrentFiber()
      return readContext(fiber, ctx)
    },

    useImperativeHandle<T>(ref: any, factory: () => T, deps?: ReadonlyArray<unknown>) {
      useEffectImpl(1, () => {
        if (!ref) return
        const value = factory()
        if (typeof ref === 'function') {
          const cleanup = ref(value)
          return typeof cleanup === 'function' ? cleanup : () => ref(null)
        }
        ref.current = value
        return () => { ref.current = null }
      }, deps == null ? undefined : [...deps, ref])
    },

    useDebugValue<T>(_value: T, _formatter?: (v: T) => any): void {
      // noop
    },

    useId(): string {
      const hook = nextHook()
      if (hook.s === undefined) {
        const fiber = getCurrentFiber()
        const root = findRootFromFiber(fiber)
        const prefix = root?.i ?? (root?.h ? ':R' : ':r')
        const id = root?.h ? root.ic++ : idCounter++
        hook.s = prefix + id.toString(36)
      }
      return hook.s as string
    },

    useTransition(): [boolean, (fn: () => void) => void] {
      return [false, startTransition]
    },

    useDeferredValue<T>(v: T): T {
      return v
    },

    useCacheRefresh(): () => void {
      // There is no client cache to invalidate. Preserve hook identity and
      // leave state and scheduling alone, as with the uncached client cache().
      return this.useCallback(() => {}, [])
    },

    useSyncExternalStore<T>(
      subscribe: (cb: () => void) => () => void,
      getSnapshot: () => T,
      getServerSnapshot?: () => T,
    ): T {
      const fiber = getCurrentFiber()
      const hook = nextHook()
      const store: {
        g: () => T
        s: (() => T) | undefined
      } = hook.q ?? {
        g: getSnapshot,
        s: getServerSnapshot,
      }
      hook.q = store
      store.g = getSnapshot
      store.s = getServerSnapshot

      // During hydration, use the server snapshot (if provided) so the tree
      // matches the SSR output. Components like TanStack Router's ClientOnly
      // rely on this: they render `false` on server, `true` on client — and
      // if we return `true` during hydration, client and server diverge and
      // the tree mounts fresh next to the SSR fallback DOM.
      const root = fiber.root ?? findRootFromFiber(fiber)
      const isHydrating = Boolean(root?.h)
      const value =
        isHydrating && getServerSnapshot ? getServerSnapshot() : getSnapshot()
      if (!Object.is(hook.s, value)) hookFlags |= 1
      hook.s = value

      const deps = [subscribe]
      const changed = hook.d === undefined || !depsEqual(hook.d, deps)
      if (changed || fiber.root?.a) {
        const previous = hook.d
        hook.d = deps
        const effect: Effect = {
          t: 1,
          s: true,
          c: () => {
            cleanupEffect(hook, fiber)

            let unsubscribed = false
            const cleanup = () => {
              unsubscribed = true
              if (typeof unsubscribe == 'function') {
                unsubscribe()
              }
            }
            const forceUpdate = () => {
              if (unsubscribed || fiber.um) {
                return
              }

              let next: T
              try {
                next = store.g()
              } catch {
                scheduleUpdate(fiber)
                return
              }

              if (!Object.is(hook.s, next)) {
                scheduleUpdate(fiber)
              }
            }
            const unsubscribe = subscribe(forceUpdate)

            // If we served the server snapshot, run a post-hydration check so
            // components like `useHydrated()` flip from false → true after the
            // initial render commits. Queued late so hydration finishes first.
            if (isHydrating && store.s) {
              queueMicrotask(() => queueMicrotask(forceUpdate))
            }

            forceUpdate()
            hook.c = cleanup
            return cleanup
          },
        }
        ;(hookEffects ||= []).push(hook, previous, effect, changed)
      }
      return value
    },

    use<T>(resource: any): T {
      if (resource?.$$typeof === REACT_RECOVERABLE_TYPE) return undefined as T
      if (resource == null) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error('use() received null or undefined')
        }
        throw new Error()
      }
      if (resource.$$typeof === REACT_CONTEXT_TYPE) {
        return readContext(getCurrentFiber(), resource)
      }
      if (typeof resource.then == 'function') {
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
      if (process.env.NODE_ENV !== 'production') {
        throw new Error('use() expected a Promise or Context')
      }
      throw new Error()
    },
  }
}

function basicReducer<S>(state: S, action: BasicStateAction<S>): S {
  return typeof action == 'function' ? (action as (p: S) => S)(state) : action
}

let idCounter = 0

function findRootFromFiber(fiber: Fiber): FiberRoot | null {
  let f: Fiber | null = fiber
  while (f) {
    if (f.root) return fiber.root = f.root
    f = f.parent
  }
  return null
}

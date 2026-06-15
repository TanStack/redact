import type { Hook, Fiber, FiberRoot, Effect } from '../core'
import { ReactSharedInternals, REACT_CONTEXT_TYPE } from '../react'
import { scheduleUpdate, enqueueEffect, readContext } from './reconcile'

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
  const fiber = getCurrentFiber()
  const idx = ReactSharedInternals.I++

  let prev = ReactSharedInternals.K

  if (idx === 0) {
    if (fiber.hooks) {
      ReactSharedInternals.K = fiber.hooks
      return fiber.hooks
    }
    const h: Hook = { s: undefined, q: undefined, d: undefined, c: undefined, n: null }
    fiber.hooks = h
    ReactSharedInternals.K = h
    return h
  }

  if (prev && prev.n) {
    ReactSharedInternals.K = prev.n
    return prev.n
  }

  const h: Hook = { s: undefined, q: undefined, d: undefined, c: undefined, n: null }
  if (prev) prev.n = h
  else fiber.hooks = h
  ReactSharedInternals.K = h
  return h
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

// Singleton — every method reads render context via ReactSharedInternals,
// and per-hook closures live on the hook itself, so nothing is render-local
// to capture. Allocating a fresh wrapper + 17 method closures per function-
// component render was pure GC pressure.
const DISPATCHER = makeDispatcherImpl()

export function makeDispatcher() {
  return DISPATCHER
}

function makeDispatcherImpl() {
  return {
    useState<S>(initial: S | (() => S)): [S, (a: BasicStateAction<S>) => void] {
      return this.useReducer(
        basicReducer as (state: S, action: BasicStateAction<S>) => S,
        typeof initial == 'function' ? (initial as () => S)() : initial,
      )
    },

    useReducer<S, A>(reducer: (s: S, a: A) => S, initialArg: any, init?: (a: any) => S) {
      const hook = nextHook()
      const fiber = getCurrentFiber()
      if (hook.q === undefined) {
        hook.s = init ? init(initialArg) : initialArg
        const queue: any = { r: reducer }
        const dispatch = (action: A) => {
          const currentState = hook.s as S
          const next = queue.r(currentState, action)
          if (!Object.is(next, currentState)) {
            hook.s = next
            scheduleUpdate(fiber)
          }
        }
        queue.d = dispatch
        hook.q = queue
      } else {
        hook.q.r = reducer
      }
      return [hook.s, hook.q.d] as [S, (a: A) => void]
    },

    useEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
      const hook = nextHook()
      const fiber = getCurrentFiber()
      const prevDeps = hook.d
      if (prevDeps !== undefined && depsEqual(prevDeps, deps)) return
      hook.d = deps
      const effect: Effect = {
        t: 0,
        c: () => {
          // Run the prior cleanup INSIDE the effect run, not during the
          // dispatch/render phase. If render A → B → C all happen back-to-
          // back before the passive microtask drains, dispatch-time cleanup
          // only fires once (between A→B) and fx B + C both run fresh,
          // leaving two side-fx (e.g. two plot SVGs) in the DOM. Doing
          // it here, at effect-run time, means every new create first tears
          // down whatever cleanup is currently live on the hook.
          if (hook.c) {
            try { hook.c() } catch {}
            // The prior cleanup was also pushed onto fiber.cu; remove
            // it so unmount doesn't double-call it.
            if (fiber.cu) {
              const i = fiber.cu.indexOf(hook.c)
              if (i >= 0) fiber.cu.splice(i, 1)
            }
            hook.c = null
          }
          const c = create()
          hook.c = typeof c == 'function' ? c : null
          return hook.c
        },
      }
      enqueueEffect(fiber, effect)
    },

    useLayoutEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
      const hook = nextHook()
      const fiber = getCurrentFiber()
      const prevDeps = hook.d
      if (prevDeps !== undefined && depsEqual(prevDeps, deps)) return
      hook.d = deps
      const effect: Effect = {
        t: 1,
        c: () => {
          // Mirror useEffect: tear down the prior cleanup at run time so
          // coalesced renders don't leak side-fx.
          if (hook.c) {
            try { hook.c() } catch {}
            if (fiber.cu) {
              const i = fiber.cu.indexOf(hook.c)
              if (i >= 0) fiber.cu.splice(i, 1)
            }
            hook.c = null
          }
          const c = create()
          hook.c = typeof c == 'function' ? c : null
          return hook.c
        },
      }
      enqueueEffect(fiber, effect)
    },

    useInsertionEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
      return this.useLayoutEffect(create, deps)
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
      const hook = nextHook()
      if (hook.d !== undefined && depsEqual(hook.d, deps)) return
      hook.d = deps
      const value = factory()
      if (ref) {
        if (typeof ref == 'function') ref(value)
        else ref.current = value
      }
    },

    useDebugValue<T>(_value: T, _formatter?: (v: T) => any): void {
      // noop
    },

    useId(): string {
      const hook = nextHook()
      if (hook.s === undefined) {
        const fiber = getCurrentFiber()
        const root = findRootFromFiber(fiber)
        hook.s = (root?.i ?? ':r') + (idCounter++).toString(36)
      }
      return hook.s as string
    },

    useTransition(): [boolean, (fn: () => void) => void] {
      return [false, (fn: () => void) => fn()]
    },

    useDeferredValue<T>(v: T): T {
      return v
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
      hook.s = value

      const deps = [subscribe]
      if (hook.d === undefined || !depsEqual(hook.d, deps)) {
        hook.d = deps
        const effect: Effect = {
          t: 1,
          c: () => {
            if (hook.c) {
              try {
                hook.c()
              } catch {
                // ignore cleanup failures
              }
              if (fiber.cu) {
                const i = fiber.cu.indexOf(hook.c)
                if (i >= 0) fiber.cu.splice(i, 1)
              }
              hook.c = null
            }

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
                hook.s = next
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
        enqueueEffect(fiber, effect)
      }
      return value
    },

    use<T>(resource: any): T {
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
    if (f.root) return f.root
    f = f.parent
  }
  return null
}

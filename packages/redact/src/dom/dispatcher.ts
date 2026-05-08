import type { Hook, Fiber, FiberRoot, Effect } from '../core'
import { ReactSharedInternals, REACT_CONTEXT_TYPE } from '../react'
import { scheduleUpdate, enqueueEffect, readContext } from './reconcile'

function getCurrentFiber(): Fiber {
  const f = ReactSharedInternals.currentFiber
  if (!f) throw new Error('Hook called outside a function component render.')
  return f
}

function nextHook(): Hook {
  const fiber = getCurrentFiber()
  const idx = ReactSharedInternals.hookIndex++

  let prev = ReactSharedInternals.currentHook

  if (idx === 0) {
    if (fiber.hooks) {
      ReactSharedInternals.currentHook = fiber.hooks
      return fiber.hooks
    }
    const h: Hook = { state: undefined, queue: undefined, deps: undefined, cleanup: undefined, next: null }
    fiber.hooks = h
    ReactSharedInternals.currentHook = h
    return h
  }

  if (prev && prev.next) {
    ReactSharedInternals.currentHook = prev.next
    return prev.next
  }

  const h: Hook = { state: undefined, queue: undefined, deps: undefined, cleanup: undefined, next: null }
  if (prev) prev.next = h
  else fiber.hooks = h
  ReactSharedInternals.currentHook = h
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
    useState<S>(initial: S | (() => S)) {
      return this.useReducer<S, S | ((p: S) => S)>(
        basicReducer as any,
        typeof initial === 'function' ? (initial as () => S)() : initial,
      )
    },

    useReducer<S, A>(reducer: (s: S, a: A) => S, initialArg: any, init?: (a: any) => S) {
      const hook = nextHook()
      const fiber = getCurrentFiber()
      if (hook.queue === undefined) {
        hook.state = init ? init(initialArg) : initialArg
        const queue: any = { reducer }
        const dispatch = (action: A) => {
          const currentState = hook.state as S
          const next = queue.reducer(currentState, action)
          if (!Object.is(next, currentState)) {
            hook.state = next
            scheduleUpdate(fiber)
          }
        }
        queue.dispatch = dispatch
        hook.queue = queue
      } else {
        hook.queue.reducer = reducer
      }
      return [hook.state, hook.queue.dispatch] as [S, (a: A) => void]
    },

    useEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
      const hook = nextHook()
      const fiber = getCurrentFiber()
      const prevDeps = hook.deps
      if (prevDeps !== undefined && depsEqual(prevDeps, deps)) return
      hook.deps = deps
      const effect: Effect = {
        tag: 'effect',
        create: () => {
          // Run the prior cleanup INSIDE the effect run, not during the
          // dispatch/render phase. If render A → B → C all happen back-to-
          // back before the passive microtask drains, dispatch-time cleanup
          // only fires once (between A→B) and effects B + C both run fresh,
          // leaving two side-effects (e.g. two plot SVGs) in the DOM. Doing
          // it here, at effect-run time, means every new create first tears
          // down whatever cleanup is currently live on the hook.
          if (hook.cleanup) {
            try { hook.cleanup() } catch {}
            // The prior cleanup was also pushed onto fiber.cleanups; remove
            // it so unmount doesn't double-call it.
            if (fiber.cleanups) {
              const i = fiber.cleanups.indexOf(hook.cleanup)
              if (i >= 0) fiber.cleanups.splice(i, 1)
            }
            hook.cleanup = null
          }
          const c = create()
          hook.cleanup = typeof c === 'function' ? c : null
          return hook.cleanup
        },
        destroy: undefined,
        deps,
      }
      enqueueEffect(fiber, effect)
    },

    useLayoutEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
      const hook = nextHook()
      const fiber = getCurrentFiber()
      const prevDeps = hook.deps
      if (prevDeps !== undefined && depsEqual(prevDeps, deps)) return
      hook.deps = deps
      const effect: Effect = {
        tag: 'layout',
        create: () => {
          // Mirror useEffect: tear down the prior cleanup at run time so
          // coalesced renders don't leak side-effects.
          if (hook.cleanup) {
            try { hook.cleanup() } catch {}
            if (fiber.cleanups) {
              const i = fiber.cleanups.indexOf(hook.cleanup)
              if (i >= 0) fiber.cleanups.splice(i, 1)
            }
            hook.cleanup = null
          }
          const c = create()
          hook.cleanup = typeof c === 'function' ? c : null
          return hook.cleanup
        },
        destroy: undefined,
        deps,
      }
      enqueueEffect(fiber, effect)
    },

    useInsertionEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
      return this.useLayoutEffect(create, deps)
    },

    useRef<T>(initial: T) {
      const hook = nextHook()
      if (hook.state === undefined) hook.state = { current: initial }
      return hook.state as { current: T }
    },

    useMemo<T>(factory: () => T, deps?: ReadonlyArray<unknown>) {
      const hook = nextHook()
      if (hook.deps !== undefined && depsEqual(hook.deps, deps)) {
        return hook.state as T
      }
      const value = factory()
      hook.state = value
      hook.deps = deps
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
      if (hook.deps !== undefined && depsEqual(hook.deps, deps)) return
      hook.deps = deps
      const value = factory()
      if (ref) {
        if (typeof ref === 'function') ref(value)
        else ref.current = value
      }
    },

    useDebugValue<T>(_value: T, _formatter?: (v: T) => any): void {
      // noop
    },

    useId(): string {
      const hook = nextHook()
      if (hook.state === undefined) {
        const fiber = getCurrentFiber()
        const root = findRootFromFiber(fiber)
        hook.state = (root?.identifierPrefix ?? ':r') + (idCounter++).toString(36)
      }
      return hook.state as string
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

      // During hydration, use the server snapshot (if provided) so the tree
      // matches the SSR output. Components like TanStack Router's ClientOnly
      // rely on this: they render `false` on server, `true` on client — and
      // if we return `true` during hydration, client and server diverge and
      // the tree mounts fresh next to the SSR fallback DOM.
      const root = fiber.root ?? findRootFromFiber(fiber)
      const isHydrating = Boolean(root?.hydrating)
      const value =
        isHydrating && getServerSnapshot ? getServerSnapshot() : getSnapshot()
      hook.state = value

      if (hook.cleanup == null) {
        const forceUpdate = () => {
          let next: T
          try {
            next = getSnapshot()
          } catch {
            scheduleUpdate(fiber)
            return
          }
          if (!Object.is(hook.state, next)) {
            hook.state = next
            scheduleUpdate(fiber)
          }
        }
        const unsubscribe = subscribe(forceUpdate)
        hook.cleanup = unsubscribe
        // Register with fiber so unmountFiber runs it. Without this, the store
        // keeps holding forceUpdate and every store update schedules an already-
        // unmounted fiber — its rerender walks stale .parent pointers and mounts
        // zombie DOM into the old parent.
        if (typeof unsubscribe === 'function') {
          fiber.cleanups ||= []
          fiber.cleanups.push(unsubscribe)
        }

        // If we served the server snapshot, run a post-hydration check so
        // components like `useHydrated()` flip from false → true after the
        // initial render commits. Queued late so hydration finishes first.
        if (isHydrating && getServerSnapshot) {
          queueMicrotask(() => queueMicrotask(forceUpdate))
        }
      }
      return value
    },

    use<T>(resource: any): T {
      if (resource == null) throw new Error('use() received null or undefined')
      if (resource.$$typeof === REACT_CONTEXT_TYPE) {
        return readContext(getCurrentFiber(), resource)
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
}

function basicReducer<S>(state: S, action: S | ((p: S) => S)): S {
  return typeof action === 'function' ? (action as (p: S) => S)(state) : action
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

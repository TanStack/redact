import { invokeCommit } from './reconcile';
import { isFunction } from '../core/functions';
import { scheduleUpdate, enqueueEffect, readContext, rememberActivityEffect, disposeCleanup, handleCommitError, findRoot } from './reconcile';
import { p as deferTransitionPassive } from './features/view-transition';
import { readThenable } from '../react/thenable';
import type { Hook, Fiber, FiberRoot, Effect, ReactNode } from '../core';
import { reactId } from './features/hydration';
import { ReactSharedInternals, REACT_CONTEXT_TYPE } from '../react';
import { runAction, trackAction, withinAction, type ActionScope } from '../react/action-scope';
import { REACT_RECOVERABLE_TYPE } from '../core/browser';
import { isRefreshing, finishRefresh, resolveRefreshType } from './refresh';
import { formState, idleFormStatus, actionInitialState } from '../react/form-state';
import { transitionScope } from '../react/hooks';
import { queueCommitEffects } from './commit';
import { q as queueTransition, r as reduceTransition, v as deferValue } from './features/suspense-runtime';
import { devToolsDispatcher, wrapDevToolsRender } from './devtools';
// The renderer owns action lifetimes, including calls through another copy
// of the public React API that shares these internals.
ReactSharedInternals.X = action => {
    const scope = runAction(action);
    return scope.d.then(() => {
        if (scope.f && !scope.h)
            throw scope.e;
    });
};
export function cleanupEffect(hook: Hook, fiber: Fiber): void {
    if (!hook.c)
        return;
    const cleanup = hook.c;
    hook.c = null;
    disposeCleanup(fiber, cleanup);
}
function hookValue(hook: Hook, value: any): any {
    if (!Object.is(hook.s, value))
        hookFlags |= 1;
    return hook.s = value;
}
function initializeReducer(hook: Hook, fiber: Fiber, initialArg: any, init: ((arg: any) => any) | undefined, eager: boolean): void {
    hook.d = hook.s = init ? init(initialArg) : initialArg;
    hook.q = (action: any) => {
        if (fiber.u || fiber.pd)
            return;
        if (queueTransition?.(hook, fiber, action))
            return;
        if (eager && ReactSharedInternals.F !== fiber && !hook.c) {
            try {
                const next = basicReducer(hook.s, action);
                if (Object.is(next, hook.s))
                    return;
                hook.s = next;
                hook.c = 0;
            }
            catch {
                hook.c = [action];
            }
        }
        else
            (hook.c ||= []).push(action);
        scheduleUpdate(fiber);
    };
}
type BasicStateAction<S> = S | ((p: S) => S);
// Reducer slots reuse the effect-cleanup field for pending actions. Zero marks
// eager state work, null means no update. Replacing arrays lets retries restore
// pending actions without copying or shifting them.
// State and reducer slots keep their last rendered value in d, even undefined.
const initialState = (value: any): any => (isFunction(value) ? value() : value);
function getCurrentFiber(): Fiber {
    const f = ReactSharedInternals.F;
    if (!f) {
        if (process.env.NODE_ENV !== 'production') {
            throw new Error('Hook called outside a function component render.');
        }
        throw new Error();
    }
    return f;
}
let hookEffects: any[] | undefined;
// Bit 1 records a changed value; bit 2 records a processed reducer queue.
let hookFlags = 0;
export const HOOK_BAILOUT = Symbol();
function nextHook(): Hook {
    const hooks = getCurrentFiber().h ||= [];
    const index = ReactSharedInternals.I++;
    return hooks[index] ||= { s: undefined, q: undefined, d: undefined, c: undefined };
}
export function renderWithHooks(fiber: Fiber, render: (props: any, ref?: any) => ReactNode, props: any, ref?: any, canBail?: boolean): ReactNode | typeof HOOK_BAILOUT {
    if (process.env.NODE_ENV !== 'production') {
        render = resolveRefreshType(render);
        if (isRefreshing(fiber))
            canBail = false;
    }
    const previousDispatcher = ReactSharedInternals.H, previousFiber = ReactSharedInternals.F, previousIndex = ReactSharedInternals.I;
    if (process.env.NODE_ENV !== 'production') render = wrapDevToolsRender(render);
    const previousEffects = hookEffects, previousFlags = hookFlags;
    hookEffects = undefined;
    hookFlags = 0;
    ReactSharedInternals.H = DISPATCHER;
    ReactSharedInternals.F = fiber;
    try {
        let rendered: ReactNode, attempts = 0;
        do {
            if (++attempts > 25)
                throw new Error(process.env.NODE_ENV !== 'production' ? 'Too many re-renders.' : '');
            if (hookEffects) {
                resetHookEffects(hookEffects);
                hookEffects = undefined;
            }
            if (fiber.r?.ri)
                fiber.il = 0;
            ReactSharedInternals.I = 0;
            if (process.env.NODE_ENV !== 'production') ReactSharedInternals.H = devToolsDispatcher(fiber, DISPATCHER);
            fiber.g = false;
            rendered = render(props, ref);
        } while (fiber.g);
        if (canBail && hookFlags === 2) {
            // React accepts the rendered dependencies on a reducer bailout, but
            // keeps the previous committed effect descriptions until real work.
            hookEffects = undefined;
            return HOOK_BAILOUT;
        }
        if (hookEffects) {
            const effects: any[] = hookEffects;
            for (let index = 0; index < effects.length; index += 4) {
                const hook = effects[index], effect = effects[index + 2];
                rememberActivityEffect(fiber, hook, effect);
                if (effects[index + 3])
                    enqueueEffect(fiber, effect);
            }
            hookEffects = undefined;
        }
        if (process.env.NODE_ENV !== 'production')
            finishRefresh(fiber);
        return rendered;
    }
    finally {
        if (hookEffects)
            resetHookEffects(hookEffects);
        hookEffects = previousEffects;
        hookFlags = previousFlags;
        ReactSharedInternals.H = previousDispatcher;
        ReactSharedInternals.F = previousFiber;
        ReactSharedInternals.I = previousIndex;
    }
}
function useEffectImpl(type: Effect['t'], create: () => any, deps?: ReadonlyArray<unknown>, subscription?: boolean): void {
    const hook = nextHook();
    const fiber = getCurrentFiber();
    const changed = hook.d === undefined || !depsEqual(hook.d, deps);
    if (!changed && !fiber.r?.a && !(type === 1 && !subscription && fiber.r?.sp))
        return;
    const previous = hook.d;
    hook.d = deps;
    const effect: Effect = {
        t: type,
        s: subscription,
        c: () => {
            cleanupEffect(hook, fiber);
            const cleanup = create();
            // Each effect owns its cleanup even when hooks return the same function.
            hook.c = isFunction(cleanup) ? () => {
                if (type === 0) {
                    const dispose = () => invokeCommit(fiber, cleanup);
                    if (!(deferTransitionPassive && deferTransitionPassive(dispose)))
                        queueCommitEffects(dispose);
                }
                else
                    cleanup();
            } : null;
            return hook.c;
        },
    };
    if (type !== 2 && !subscription)
        effect.d = () => cleanupEffect(hook, fiber);
    (hookEffects ||= []).push(hook, previous, effect, changed);
}
function depsEqual(a: ReadonlyArray<unknown> | undefined, b: ReadonlyArray<unknown> | undefined): boolean {
    if (process.env.NODE_ENV !== 'production' && isRefreshing(ReactSharedInternals.F))
        return false;
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        if (!Object.is(a[i], b[i]))
            return false;
    }
    return true;
}
function resetHookEffects(effects: any[]): void {
    for (let index = 0; index < effects.length; index += 4)
        effects[index].d = effects[index + 1];
}
// Singleton — every method reads render context via ReactSharedInternals,
// and per-hook closures live on the hook itself, so nothing is render-local
// to capture. Allocating a fresh wrapper + 17 method closures per function-
// component render was pure GC pressure.
const DISPATCHER = {
    useTransition(): [
        boolean,
        (fn: () => void) => void
    ] {
        const hook = nextHook(), fiber = getCurrentFiber();
        const queue = hook.q ||= { p: 0, f: false, e: undefined };
        hook.c ||= (fn: () => void) => {
            const scope = transitionScope(() => runAction(fn, fiber.r, scope => {
                scope.n = undefined;
                queue.p++;
                scheduleUpdate(fiber);
                fiber.bt = false;
            }));
            const finish = () => {
                if (scope.f && !scope.h) {
                    queue.f = true;
                    queue.e = scope.e;
                }
                if (!scope.n)
                    queue.p--;
                scheduleUpdate(fiber);
            };
            if (!scope.p) {
                finish();
                return;
            }
            if (scope.p > (scope.v || 0))
                scope.n?.(scope);
            scope.d.then(finish);
        };
        if (queue.f)
            throw queue.e;
        return [hookValue(hook, queue.p > 0), hook.c];
    },
    useMemo<T>(factory: () => T, deps?: ReadonlyArray<unknown>) {
        const hook = nextHook();
        if (hook.d === undefined || !depsEqual(hook.d, deps)) {
            hook.s = factory();
            hook.d = deps;
        }
        return hook.s as T;
    },
    useLayoutEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
        useEffectImpl(1, create, deps);
    },
    useInsertionEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
        useEffectImpl(2, create, deps);
    },
    useCallback<T extends Function>(fn: T, deps?: ReadonlyArray<unknown>): T {
        return this.useMemo(() => fn, deps) as T;
    },
    useRef<T>(initial: T) {
        return (nextHook().s ||= { current: initial }) as {
            current: T;
        };
    },
    useContext<T>(ctx: any): T {
        return readContext(getCurrentFiber(), ctx);
    },
    useImperativeHandle<T>(ref: any, factory: () => T, deps?: ReadonlyArray<unknown>) {
        useEffectImpl(1, () => {
            if (!ref)
                return;
            const value = factory();
            if (isFunction(ref)) {
                const cleanup = ref(value);
                return isFunction(cleanup) ? cleanup : () => ref(null);
            }
            ref.current = value;
            return () => { ref.current = null; };
        }, deps == null ? undefined : [...deps, ref]);
    },
    use<T>(resource: any): T {
        if (resource?.$$typeof === REACT_RECOVERABLE_TYPE)
            return undefined as T;
        if (resource?.$$typeof === REACT_CONTEXT_TYPE) {
            return readContext(getCurrentFiber(), resource);
        }
        if (isFunction(resource?.then)) {
            return readThenable(resource) as T;
        }
        if (process.env.NODE_ENV !== 'production') {
            throw new Error(resource == null ? 'use() received null or undefined' : 'use() expected a Promise or Context');
        }
        throw new Error();
    },
    useDebugValue<T>(_value: T, _formatter?: (v: T) => any): void {
        // noop
    },
    useDeferredValue<T>(v: T): T {
        if (!deferValue)
            return v;
        const hook = nextHook();
        return hookValue(hook, deferValue(hook, getCurrentFiber(), v));
    },
    useReducer<S, A>(reducer: (s: S, a: A) => S, initialArg: any, init?: (a: any) => S) {
        const hook = nextHook();
        if (hook.q === undefined)
            initializeReducer(hook, getCurrentFiber(), initialArg, init, reducer === basicReducer);
        const reduced = reduceTransition?.(hook, reducer);
        const actions = hook.c;
        if (actions != null || reduced) {
            hook.c = null;
            let state = hook.s;
            if (actions)
                for (const action of actions)
                    state = reducer(state, action);
            hookFlags |= Object.is(state, hook.d) ? 2 : 3;
            hook.d = hook.s = state;
        }
        return [hook.s, hook.q] as [
            S,
            (a: A) => void
        ];
    },
    useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T {
        const fiber = getCurrentFiber();
        const hook = nextHook();
        const store: {
            g: () => T;
        } = hook.q ||= {};
        store.g = getSnapshot;
        // During hydration, use the server snapshot (if provided) so the tree
        // matches the SSR output. Components like TanStack Router's ClientOnly
        // rely on this: they render `false` on server, `true` on client — and
        // if we return `true` during hydration, client and server diverge and
        // the tree mounts fresh next to the SSR fallback DOM.
        const root = fiber.r ?? findRoot(fiber);
        const isHydrating = Boolean(root?.h);
        const value = isHydrating && getServerSnapshot ? getServerSnapshot() : getSnapshot();
        hookValue(hook, value);
        useEffectImpl(1, () => {
            let active = true;
            const check = () => {
                if (!active || fiber.u)
                    return;
                try {
                    if (Object.is(hook.s, store.g()))
                        return;
                }
                catch { }
                scheduleUpdate(fiber);
            };
            const unsubscribe = subscribe(check);
            check();
            return () => {
                active = false;
                if (isFunction(unsubscribe))
                    unsubscribe();
            };
        }, [subscribe], true);
        return value;
    },
    useActionState<S, P>(action: (state: Awaited<S>, payload: P) => S | Promise<S>, initial: Awaited<S>): [
        Awaited<S>,
        (payload: P) => void,
        boolean
    ] {
        const hook = nextHook(), fiber = getCurrentFiber();
        // q is included in commit checkpoints. Each queue owns the committed
        // callback, latest result, outstanding count, failure and async tail.
        const queue = hook.q ||= { a: action, v: actionInitialState(fiber, initial), p: 0, f: false, e: undefined, t: null };
        useEffectImpl(2, () => { queue.a = action; }, [action]);
        hook.c ||= (payload: P) => {
            if (queue.f || fiber.u || fiber.pd)
                return;
            const invoke = queue.a, scope = ReactSharedInternals.B;
            if (scope) {
                queue.p++;
                scheduleUpdate(fiber);
            }
            const execute = async () => {
                if (queue.f)
                    return;
                try {
                    queue.v = await withinAction(scope, () => invoke(queue.v, payload));
                }
                catch (error) {
                    queue.f = true;
                    queue.e = error;
                    if (scope) {
                        scope.f = true;
                        scope.h = true;
                        scope.e = error;
                    }
                }
                scheduleUpdate(fiber);
            };
            const task = queue.t ? queue.t.then(execute) : execute();
            queue.t = task;
            if (scope)
                trackAction(scope, task);
            task.then(() => {
                if (queue.t === task)
                    queue.t = null;
                if (scope) {
                    queue.p--;
                    scheduleUpdate(fiber);
                }
            });
        };
        if (queue.f)
            throw queue.e;
        const pending = queue.p > 0;
        if (!Object.is(hook.s, queue.v) || hook.d !== pending)
            hookFlags |= 1;
        hook.s = queue.v;
        hook.d = pending;
        return [queue.v, hook.c, pending];
    },
    useOptimistic<S, A>(state: S, updateFn?: (state: S, action: A) => S): [
        S,
        (action: A) => void
    ] {
        const hook = nextHook(), fiber = getCurrentFiber();
        if (!hook.q) {
            hook.s = [];
            const update = () => scheduleUpdate(fiber);
            hook.q = (action: A) => {
                const scope = ReactSharedInternals.B;
                if (!scope?.p || fiber.u || fiber.pd)
                    return;
                hook.s = [...hook.s, [scope, action]];
                scope.l.add(update);
                update();
            };
        }
        hook.s = hook.s.filter(([scope]: [
            ActionScope
        ]) => scope.p > 0);
        let value = state;
        for (const [, action] of hook.s)
            value = updateFn ? updateFn(value, action) : action;
        if (!Object.is(hook.d, value))
            hookFlags |= 1;
        hook.d = value;
        return [value, hook.q];
    },
    useEffect(create: () => any, deps?: ReadonlyArray<unknown>) {
        useEffectImpl(0, create, deps);
    },
    useCacheRefresh(): () => void {
        // There is no client cache to invalidate. Preserve hook identity and
        // leave state and scheduling alone, as with the uncached client cache().
        return this.useCallback(() => { }, []);
    },
    useState<S>(initial: S | (() => S)): [
        S,
        (a: BasicStateAction<S>) => void
    ] {
        return DISPATCHER.useReducer<S, BasicStateAction<S>>(basicReducer, initial, initialState);
    },
    useFormStatus() {
        let parent = getCurrentFiber().p;
        while (parent && parent.type !== 'form')
            parent = parent.p;
        const state = parent ? formState(parent) : null;
        const subscribe = this.useCallback((listener: () => void) => {
            state?.l.add(listener);
            return () => { state?.l.delete(listener); };
        }, [state]);
        return this.useSyncExternalStore(subscribe, () => state?.s ?? idleFormStatus, () => idleFormStatus);
    },
    useId(): string {
        const hook = nextHook();
        const fiber = getCurrentFiber();
        const root = findRoot(fiber);
        if (root?.ri) {
            const id = reactId(fiber, root);
            return hook.s ??= id;
        }
        return hook.s ??= (root?.i ?? (root?.h ? ':R' : ':r')) + (root?.h ? root.ic++ : idCounter++).toString(36);
    }
};
const basicReducer = <S>(state: S, action: BasicStateAction<S>): S => (isFunction(action) ? (action as (p: S) => S)(state) : action);
let idCounter = 0;

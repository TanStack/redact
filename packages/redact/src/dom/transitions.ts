import type { Fiber, FiberRoot, Hook } from '../core';
import { findRoot, scheduleUpdate } from './reconcile';
import { finish, type ActionScope } from '../react/action-scope';
import { isThenable } from '../core/functions';
import { checkpointCommit, rewindCommit, queueCommitEffects } from './commit';
import { ReactSharedInternals } from '../react/shared-internals';
import { transitionScope } from '../react/hooks';
export let a = false;
export const p = (fiber: Fiber): boolean => !!fiber.r?.tr?.has(fiber);
export function q(hook: Hook, fiber: Fiber, action: any): boolean {
    const scope = ReactSharedInternals.T && ReactSharedInternals.B;
    if (!scope && !hook.t)
        return false;
    const previous = hook.t || (hook.c || []).reduce((p: any, a: any) => ([p, undefined, a, hook.s]), null);
    hook.c = null;
    hook.t = [previous, scope, action, previous ? previous[3] : hook.s];
    if (scope)
        enqueue(fiber, scope);
    else
        scheduleUpdate(fiber);
    return true;
}
export function v(hook: Hook, fiber: Fiber, value: any): any {
    if (!hook.d || a) {
        hook.d = true;
        return value;
    }
    else if (!Object.is(value, hook.s))
        enqueue(fiber);
    return hook.s;
}
export function c(root: FiberRoot): void {
    const pending = root.tr;
    if (pending) {
        complete(pending.s);
        pending.s.clear();
        pending.clear();
        pending.u = undefined;
    }
}
export function t(root: FiberRoot, render: (root: FiberRoot, fibers: Fiber[], update?: () => void) => void): void {
    const pending = root.tr;
    if (!pending?.size)
        return;
    const checkpoint = checkpointCommit(root.r);
    const fibers = [...pending];
    a = true;
    try {
        const update = pending.u;
        render(root, fibers, update);
        if (pending.u === update) pending.u = undefined;
        for (const fiber of fibers) {
            pending.delete(fiber);
        }
        if (!pending.size) {
            const work = pending.s;
            pending.s = new Set();
            queueCommitEffects(() => complete(work));
        }
    }
    catch (error) {
        if (!isThenable(error))
            throw error;
        rewindCommit(checkpoint);
        for (const scope of pending.s)
            scope.n?.(scope);
        if (pending.w !== error) {
            pending.w = error;
            const retry = () => transitionScope(() => {
                for (const fiber of pending)
                    scheduleUpdate(fiber);
            });
            error.then(retry, retry);
        }
    }
    finally {
        a = false;
    }
}
function complete(work: Set<ActionScope>): void {
    for (const scope of work) {
        scope.v!--;
        finish(scope);
    }
}
function enqueue(fiber: Fiber, scope?: ActionScope | null): void {
    const root = findRoot(fiber);
    if (!root)
        return;
    let pending = root.tr;
    if (!pending) {
        pending = root.tr = new Set() as NonNullable<FiberRoot["tr"]>;
        pending.s = new Set();
    }
    const fresh = !pending.has(fiber);
    pending.add(fiber);
    if (scope && !pending.s.has(scope)) {
        scope.v = (scope.v || 0) + 1;
        scope.p++;
        pending.s.add(scope);
    }
    if (ReactSharedInternals.F) {
        if (fresh)
            queueCommitEffects(() => scheduleUpdate(fiber));
    }
    else
        scheduleUpdate(fiber);
}
export function s(root: FiberRoot, render: () => void): boolean {
    if (!ReactSharedInternals.T) {
        if (root.tr) root.tr.u = undefined;
        return false;
    }
    const scope = ReactSharedInternals.B;
    enqueue(root.r, scope?.o === root ? scope : undefined);
    root.tr!.u = render;
    return true;
}
export function r(hook: Hook, reducer: (state: any, action: any) => any): boolean {
    if (!hook.t)
        return false;
    let state = hook.t[3], base = state, pending: any = undefined;
    const stack = [];
    for (let node = hook.t; node; node = node[0])
        stack.push(node);
    while (stack.length) {
        const node = stack.pop()!;
        const skipped = node[1] && !a;
        if (skipped) {
            if (!pending)
                base = state;
        }
        else
            state = reducer(state, node[2]);
        if (pending || skipped)
            pending = [pending, node[1], node[2], base];
    }
    hook.t = pending;
    hook.s = state;
    return true;
}

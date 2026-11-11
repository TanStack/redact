import { walkRetained } from './walk';
import { isFunction } from '../core/functions';
import { setProp } from './dom';
export interface CommitPlan {
    q: any[][]; // Before-mutation, mutation, effect, rollback, failure, and placement queues.
    c: number[][]; // Queue lengths saved at each rollback checkpoint.
    b: number; // Next before-mutation callback, including reentrant commits.
    m: boolean; // Mutation phase has started, preventing duplicate commits.
}
export let currentCommit: CommitPlan | null = null;
let activeCommit: CommitPlan | null = null;
let reusableCommit: CommitPlan | undefined;
let checkpointHook: (() => void) | undefined;
let placementHook: (parents: Iterable<Fiber>) => void;
const createCommit = (): CommitPlan => ({ q: [[], [], [], [], [], []], c: [], b: 0, m: false });
function clearCommit(plan: CommitPlan): void {
    for (const queue of plan.q)
        queue.length = 0;
    plan.c.length = 0;
}
export function setCommitPlacementHook(hook: typeof placementHook): void { placementHook = hook; }
export function checkpointCommit(fiber?: Fiber): number {
    if (!currentCommit)
        return -1;
    const checkpoint = currentCommit.c.push(currentCommit.q.map(queue => queue.length)) - 1;
    if (fiber)
        walkRetained(fiber, rememberFiber);
    checkpointHook?.();
    return checkpoint;
}
export function commitBeforeMutation(plan: CommitPlan): void {
    const queue = plan.q[0]!;
    while (plan.b < queue.length)
        queue[plan.b++]!();
}
export function queueBeforeMutation(work: () => void): void {
    if (currentCommit)
        currentCommit.q[0]!.push(work);
    else
        work();
}
export function onCommitFailure(work: () => void): void {
    if (currentCommit)
        currentCommit.q[4]!.push(work);
    else
        work();
}
export function setCommitCheckpointHook(hook: () => void): void {
    checkpointHook = hook;
}
export function queueText(node: Text, value: string): void {
    if (currentCommit)
        currentCommit.q[1]!.push(value, node);
    else
        node.data = value;
}
export function queueProp(node: Element, key: string, value: any, previous: any, svg: boolean): void {
    queueMutation(() => setProp(node, key, value, previous, svg));
}
export function queueMutation(work: () => void): void {
    if (!currentCommit) {
        work();
        return;
    }
    currentCommit.q[1]!.push(work);
}
export function rewindCommit(checkpoint: number): void {
    if (!currentCommit || checkpoint < 0)
        return;
    const lengths = currentCommit.c[checkpoint]!;
    const undo = currentCommit.q[3]!;
    for (let index = undo.length - 1; index >= lengths[3]!; index--)
        undo[index]!();
    currentCommit.q.forEach((queue, index) => { queue.length = lengths[index]!; });
    currentCommit.c.length = checkpoint;
}
export function queuePlacement(parent: Fiber): void {
    if (!currentCommit) {
        placementHook([parent]);
        return;
    }
    currentCommit.q[5]!.push(parent);
}
export function onCommitRollback(work: () => void): void {
    currentCommit?.q[3]!.push(work);
}
export function commitMutation(plan: CommitPlan): void {
    if (plan.m)
        return;
    commitBeforeMutation(plan);
    if (plan.m)
        return;
    plan.m = true;
    const previous = activeCommit;
    activeCommit = plan;
    try {
        const mutations = plan.q[1]!;
        for (let index = 0; index < mutations.length; index++) {
            const work = mutations[index];
            if (isFunction(work))
                work();
            else
                mutations[++index].data = work;
        }
        placementHook?.(plan.q[5]!);
        for (const work of plan.q[2]!)
            work();
    }
    finally {
        activeCommit = previous;
        clearCommit(plan);
    }
}
export function queueCommitEffects(work: () => void): void {
    const plan = currentCommit || activeCommit;
    if (plan)
        plan.q[2]!.push(work);
    else
        work();
}
export function commitSynchronously(render: () => void): void {
    if (currentCommit) {
        render();
        return;
    }
    const plan = reusableCommit || createCommit();
    reusableCommit = undefined;
    plan.b = 0;
    plan.m = false;
    try {
        commitMutation(prepareCommit(render, plan));
    }
    finally {
        // Failed preparation must not leave work for a later synchronous root.
        if (!plan.m) {
            clearCommit(plan);
        }
        reusableCommit = plan;
    }
}
import { FiberTag, type Fiber, type Hook } from '../core';
function rememberFiber(fiber: Fiber): void {
    const saved = { ...fiber };
    // Memo and lazy preserve their wrapper tag around the same class instance.
    const instance = fiber.i?._f === fiber ? fiber.i : null;
    const hooks = fiber.h?.map(hook => [hook, { ...hook },
        hook.q && isObject(hook.q) ? { ...hook.q } : null]);
    const memoized = fiber.b && (instance || fiber.t === FiberTag.Suspense || fiber.t === FiberTag.Fragment)
        ? { ...fiber.b } : null;
    if (fiber.cx)
        saved.cx = new Map(fiber.cx);
    if (fiber.e)
        saved.e = fiber.e.slice();
    const props = instance?.props, state = instance?.state, context = instance?.context;
    onCommitRollback(() => {
        Object.assign(fiber, saved);
        if (memoized) {
            for (const key in fiber.b)
                if (!(key in memoized))
                    delete fiber.b[key];
            Object.assign(fiber.b, memoized);
        }
        if (hooks) {
            fiber.h!.length = hooks.length;
            for (let index = 0; index < hooks.length; index++) {
                const [hook, saved, queue] = hooks[index]!;
                fiber.h![index] = Object.assign(hook, saved);
                if (queue)
                    Object.assign(hook.q, queue);
            }
        }
        if (instance) {
            instance.props = props;
            instance.state = state;
            instance.context = context;
        }
    });
}
import { isObject } from '../core/functions';
// Keep the old sibling list for a failed structural render.
export function rememberChildList(parent: Fiber, children: Fiber[]): void {
    if (!currentCommit) return;
    onCommitFailure(() => {
        for (let child = parent.c; child; child = child.s) {
            if (!children.includes(child))
                walkRetained(child, fiber => { fiber.u = true; });
        }
        parent.c = children[0] ?? null;
        for (let index = 0; index < children.length; index++)
            children[index]!.s = children[index + 1] ?? null;
    });
}
export function prepareCommit(render: () => void, plan = createCommit()): CommitPlan {
    const previous = currentCommit;
    currentCommit = plan;
    try {
        render();
    }
    catch (error) {
        currentCommit = null;
        for (const work of plan.q[4]!)
            work();
        throw error;
    }
    finally {
        currentCommit = previous;
    }
    return plan;
}

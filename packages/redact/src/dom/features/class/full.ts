import { devToolsMetadata } from '../../../core/devtools';
import { resolveClassProps } from '../../../core/class-props';
import { invokeCommit, stageCommit, recoveringBoundaries } from '../../reconcile';
import { installRenderer, reconcileRaw, childrenToArray, scheduleUpdate, scheduleLifecycle, isThenable, handleSuspended, handleErrorInRender, readContext, attachRef, syncRefIfChanged, isActivityHidden, layoutIsDisconnected, RenderErrorCapture, handleCommitError, } from '../../reconcile';
import { checkpointCommit, rewindCommit, queueBeforeMutation, queueMutation } from '../../commit';
import { FiberTag, type Fiber, type ReactNode } from '../../../core';
import { failRefreshBoundary } from '../../refresh';
import { isFunction } from '../../../core/functions';
import { q as queueTransition, r as reduceTransition } from '../suspense-runtime';
import { devToolsError, markDevToolsError, markDevToolsClassUpdate, consumeDevToolsClassUpdate } from '../../devtools';
function findHost(fiber: Fiber): Node | null {
    if (fiber.t <= FiberTag.Text)
        return fiber.n;
    if (fiber.t === FiberTag.Resource)
        return fiber.i;
    for (let child = fiber.c; child; child = child.s) {
        const node = findHost(child);
        if (node)
            return node;
    }
    return null;
}
installRenderer(FiberTag.Class, renderClass);
export function findDOMNode(instance: any): Node | null {
    const fiber = instance._f as Fiber | undefined;
    if (!fiber || fiber.u)
        throw new Error(process.env.NODE_ENV !== 'production' ? 'Unable to find node on an unmounted component.' : '');
    return findHost(fiber);
}
function renderClass(fiber: Fiber): void {
    fiber.cx?.clear();
    const Ctor = fiber.type as any;
    let instance = fiber.i;
    const props = resolveClassProps(Ctor, fiber.v ?? {});
    const isNew = !instance;
    const previous = fiber.b?.c;
    let didRender = true;
    let captured = fiber.b?.error instanceof RenderErrorCapture ? fiber.b.error as RenderErrorCapture : undefined;
    if (captured)
        delete fiber.b.error;
    // Class contextType: read the current value of the subscribed context so
    // `this.context` reflects the nearest Provider. Evaluated every render.
    const ctxValue = Ctor.contextType ? readContext(fiber, Ctor.contextType) : undefined;
    const contextChanged = instance && !Object.is(instance.context, ctxValue);
    if (process.env.NODE_ENV !== 'production') {
        const override = devToolsError(fiber);
        if (override === true) captured = new RenderErrorCapture(fiber, new Error('Simulated error coming from DevTools'));
        else if (override === false && instance) {
            instance.state = { ...instance.state, ...new Ctor(fiber.m ?? props, instance.context).state };
            captured = undefined;
            markDevToolsClassUpdate(fiber);
        }
    }
    if (isNew) {
        instance = new Ctor(props, ctxValue);
        instance.props = props;
        instance.context = ctxValue;
        instance._f = fiber;
        instance._q = (updater: any, cb?: () => void) => {
            if (queueTransition) {
                const hook = (fiber.h ||= [{ s: instance.state, d: undefined, c: null, q: undefined }])[0]!;
                if (!hook.t)
                    hook.s = instance.state;
                if (queueTransition(hook, fiber, [updater, cb]))
                    return;
            }
            instance.state = updateState(instance.state, updater, instance.props);
            instance._u(cb);
        };
        instance._u = (cb?: () => void) => {
            if (cb)
                stageCommit(fiber, () => cb.call(instance), true);
            scheduleUpdate(fiber);
        };
        if (process.env.NODE_ENV !== 'production') {
            const forceUpdate = instance.forceUpdate;
            instance.forceUpdate = (...args: any[]) => { markDevToolsClassUpdate(fiber); forceUpdate.apply(instance, args); };
        }
        fiber.i = instance;
    }
    if (fiber.h && reduceTransition?.(fiber.h[0]!, (state, update) => {
        if (update[1])
            stageCommit(fiber, () => { const callback = update[1]; update[1] = null; callback?.call(instance); }, true);
        return updateState(state, update[0], props);
    }))
        instance.state = fiber.h[0]!.s;
    instance.context = ctxValue;
    if (Ctor.getDerivedStateFromProps) {
        const d = Ctor.getDerivedStateFromProps(props, instance.state);
        if (d)
            instance.state = { ...instance.state, ...d };
    }
    if (!isNew) {
        if (!(process.env.NODE_ENV !== 'production' && consumeDevToolsClassUpdate(fiber)) && !captured && instance.shouldComponentUpdate && !contextChanged) {
            if (!instance.shouldComponentUpdate(props, instance.state, instance.context)) {
                didRender = false;
            }
        }
        instance.props = props;
    }
    // Errors from a recovery tree belong to an enclosing boundary. A nested
    // boundary introduced by that recovery remains eligible to catch them.
    if (captured) recoveringBoundaries.add(fiber);
    try {
        if (captured && Ctor.getDerivedStateFromError) {
            const update = Ctor.getDerivedStateFromError(captured.e);
            if (update != null)
                instance.state = { ...instance.state, ...update };
        }
        let rendered: ReactNode = captured && !Ctor.getDerivedStateFromError ? null : didRender ? instance.render() : fiber.b?.r;
        fiber.b = { ...(fiber.b ?? {}), r: rendered };
        const canCatch = Ctor.getDerivedStateFromError || instance.componentDidCatch;
        if (canCatch)
            fiber.b.b = Ctor;
        if (canCatch && fiber.r)
            fiber.r.eb = true;
        const checkpoint = canCatch ? checkpointCommit(fiber) : -1;
        try {
            reconcileRaw(fiber, rendered);
        }
        catch (error) {
            if (!(error instanceof RenderErrorCapture) || error.b !== fiber)
                throw error;
            rewindCommit(checkpoint);
            captured = error;
            recoveringBoundaries.add(fiber);
            didRender = true;
            if (Ctor.getDerivedStateFromError) {
                const update = Ctor.getDerivedStateFromError(error.e);
                if (update != null)
                    instance.state = { ...instance.state, ...update };
                rendered = instance.render();
            }
            else
                rendered = null;
            fiber.b = { ...(fiber.b ?? {}), r: rendered };
            reconcileRaw(fiber, rendered);
        }
    }
    finally {
        recoveringBoundaries.delete(fiber);
    }
    fiber.m = props;
    const state = instance.state;
    queueMutation(() => { fiber.b.c = { p: props, s: state }; });
    if (isNew)
        attachRef(fiber, instance);
    else
        syncRefIfChanged(fiber, instance);
    // Schedule lifecycle
    if (isNew) {
        if (instance.componentDidMount) {
            scheduleLifecycle(fiber, () => instance.componentDidMount());
        }
    }
    else if (previous && didRender) {
        let snapshot: any;
        if (instance.getSnapshotBeforeUpdate && !layoutIsDisconnected(fiber)) {
            queueBeforeMutation(() => {
                if (!fiber.u && !fiber.pd && !isActivityHidden(fiber) && !layoutIsDisconnected(fiber)) {
                    snapshot = invokeCommit(fiber, () => instance.getSnapshotBeforeUpdate(previous.p, previous.s));
                }
            });
        }
        if (instance.componentDidUpdate) {
            scheduleLifecycle(fiber, () => instance.componentDidUpdate(previous.p, previous.s, snapshot));
        }
    }
    if (captured) {
        if (process.env.NODE_ENV !== 'production') markDevToolsError(fiber);
        if (process.env.NODE_ENV !== 'production')
            failRefreshBoundary(fiber);
        const error = captured.e;
        const info = { componentStack: captured.s };
        scheduleLifecycle(fiber, () => {
            const previousCurrent = process.env.NODE_ENV !== 'production' ? devToolsMetadata.current : null;
            const previousStack = process.env.NODE_ENV !== 'production' ? devToolsMetadata.errorStack : undefined;
            if (process.env.NODE_ENV !== 'production') {
                devToolsMetadata.current = null;
                devToolsMetadata.errorStack = captured!.o ?? null;
            }
            try {
                try {
                    fiber.r?.ce?.(error, { ...info, errorBoundary: instance });
                }
                catch (callbackError) {
                    setTimeout(() => { throw callbackError; });
                }
                instance.componentDidCatch?.(error, info);
            } finally {
                if (process.env.NODE_ENV !== 'production') {
                    devToolsMetadata.current = previousCurrent;
                    devToolsMetadata.errorStack = previousStack;
                }
            }
        });
    }
}
function updateState(state: any, update: any, props: any): any {
    const next = isFunction(update) ? update(state, props) : update;
    return next == null ? state : { ...state, ...next };
}

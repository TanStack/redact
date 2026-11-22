import { a as transitionRender } from '../suspense-runtime';
import { cleanupEffect } from '../../dispatcher';
import { checkpointCommit, rewindCommit, queueMutation, onCommitFailure } from '../../commit';
import { REACT_SUSPENSE_TYPE, ReactSharedInternals, startTransition } from '../../../react';
import { FiberTag, createFiber, type Fiber } from '../../../core';
import { disconnectClass, inSuspensePrimary, setRetainedFlag, walkRetained } from '../../retained-effects';
import { hasContextChanged, renderContextConsumers } from '../context';
import { visitChildren, installRenderer, registerTypeMatcher, installCapability, reconcileRaw, childrenToArray, renderNode, scheduleUpdate, unmountAllChildren, removeFiber, findRoot, runEffects, getCurrentRoot, withCurrentRoot, discardPendingWork, findSuspenseBoundary, RenderSuspenseCapture, activityIsDisconnected, isActivityHidden, attachRef, detachRef, enqueueEffect, flushFiberCommits, scheduleLifecycle, handleCommitError, disposeCleanup, isThenable, defaultHandleSuspended, } from '../../reconcile';
import { tryConsumeBoundary, isHydrationBailout, } from '../hydration';
import { hydrateSuspenseBoundary, recoverBoundaryHydration } from '../suspense-hydration';
import { devToolsSuspension } from '../../devtools';
let suspendHandler: ((t: Promise<any>) => void) | null = null;
// React's Suspense semantics: when a re-render of an already-committed
// boundary suspends, the previously-committed children are kept in the DOM
// (hidden) so their scroll position, focus, selection, native form state,
// and component state survive across the suspension. The fallback is mounted
// alongside the hidden primary until the pending promise resolves.
//
// We track the hidden subtree DOM in `state.d` (root host nodes +
// their original `display` so we can restore it) and the fallback as a
// detached Fragment fiber in `state.f` (deliberately kept OUT of
// `fiber.c` so reconciles against `props.children` don't trip on it).
// First-mount suspensions discard the failed primary but retain a separate
// fallback fiber so unsuccessful retries preserve its state and DOM.
interface SuspenseState {
    p?: Promise<any> | null;
    b?: Comment;
    e?: Comment;
    r?: any;
    w?: boolean;
    u?: boolean;
    // Re-suspend preservation:
    d?: Array<[
        HTMLElement,
        string
    ]> | null;
    f?: Fiber | null;
}
export function scheduleRetry(fiber: Fiber): void {
    const previous = ReactSharedInternals.T;
    ReactSharedInternals.T = null;
    try {
        startTransition(() => scheduleUpdate(fiber));
    }
    finally {
        ReactSharedInternals.T = previous;
    }
}
export function retryHydration(fiber: Fiber, thenable: Promise<any>): void {
    const retry = () => { if (!fiber.u) scheduleRetry(fiber); };
    thenable.then(retry, retry);
}
function reconnectLayout(fiber: Fiber): void {
    if (!fiber.ld || isActivityHidden(fiber) || activityIsDisconnected(fiber))
        return;
    if (inSuspensePrimary(fiber))
        return;
    setRetainedFlag(fiber, 'ld', false);
    const instance = fiber.i?._f === fiber ? fiber.i : null;
    if (fiber.t === FiberTag.Host || fiber.t === FiberTag.Resource)
        attachRef(fiber, fiber.n);
    else if (instance || fiber.t === FiberTag.Fragment)
        attachRef(fiber, fiber.i);
    for (const effect of fiber.ef?.values() ?? []) {
        if (effect.t === 1 && !effect.s)
            enqueueEffect(fiber, effect);
    }
    if (instance?.componentDidMount)
        scheduleLifecycle(fiber, () => instance.componentDidMount());
    flushFiberCommits(fiber);
}
function disconnectLayout(fiber: Fiber): void {
    if (setRetainedFlag(fiber, 'ld', true) || activityIsDisconnected(fiber))
        return;
    queueMutation(() => {
        for (const [hook, effect] of fiber.ef ?? []) {
            if (effect.t === 1 && !effect.s)
                cleanupEffect(hook, fiber);
        }
        const cleanup = fiber.rc;
        fiber.rc = null;
        if (cleanup)
            disposeCleanup(fiber, cleanup);
        detachRef(fiber.cr ?? fiber.ref, fiber);
        fiber.cr = null;
        disconnectClass(fiber);
    });
}
// Walk a fiber subtree collecting host/text DOM nodes that sit at the root
// of the subtree (do not descend through their children — display:none on
// the root hides the whole element). Used by the hide-on-suspend path.
function hideRootHostDoms(fiber: Fiber, out: Array<[
    HTMLElement,
    string
]>): void {
    if (fiber.t === FiberTag.Host) {
        const el = fiber.n as HTMLElement;
        const existing = out.find(([node]) => node === el);
        const entry: [
            HTMLElement,
            string
        ] = existing ?? [el, el.style.display];
        if (!existing)
            out.push(entry);
        const display = fiber.v?.style?.display;
        queueMutation(() => {
            // Earlier Activity or host updates in this commit can change display.
            if (!existing || el.style.display !== 'none' || display === 'none')
                entry[1] = el.style.display;
            el.style.display = 'none';
        });
        return;
    }
    if (fiber.t === FiberTag.Portal)
        return;
    visitChildren(fiber, hideRootHostDoms, out, true);
}
function setUpdateBoundary(fiber: Fiber, boundary: Fiber | null | undefined): void {
    fiber.su = boundary ?? null;
    const primary = fiber.t === FiberTag.Suspense && fiber.b?.p ? fiber : boundary;
    visitChildren(fiber, setUpdateBoundary, primary, true);
    if (fiber.t === FiberTag.Suspense && fiber.b?.f)
        setUpdateBoundary(fiber.b.f, boundary);
}
export function renderSuspense(fiber: Fiber): void {
    const props = fiber.v ?? {};
    let state = (fiber.b ??= {}) as SuspenseState;
    // Streaming hydration: if the next DOM node is a server-emitted boundary
    // marker, route through the boundary-aware hydration path.
    const root = getCurrentRoot();
    if (root)
        root.sp = true;
    if (root?.h && !state.b) {
        const boundary = tryConsumeBoundary(fiber.p!);
        if (boundary) {
            hydrateSuspenseBoundary(fiber, props, boundary);
            return;
        }
    }
    if (state.w && state.b && state.e) {
        if (state.b.data === '$?' || state.b.data === '$~') {
            if (!root?.h && props.children !== fiber.m?.children) {
                ;
                (state.b as any)._reactRetry = undefined;
                recoverBoundaryHydration(fiber, props.children, state.b.parentNode!, state.b, state.e, true);
                fiber.m = props;
                return;
            }
            state.r = props.children;
            fiber.m = props;
            return;
        }
        const checkpoint = checkpointCommit(fiber);
        const wasHydrating = root!.h;
        root!.h = true;
        try {
            hydrateSuspenseBoundary(fiber, props, [state.b.data === '$!' ? 2 : 0, 0, state.b, state.e]);
        }
        catch (error) {
            if (!isThenable(error))
                throw error;
            rewindCommit(checkpoint);
            fiber.b = state;
            retryHydration(fiber, error);
        }
        finally {
            root!.h = wasHydrating;
        }
        return;
    }
    // New primary children or context can unblock a boundary before its old
    // promise settles. A fallback-only update can keep the pending primary.
    if (state.p && !state.u && props.children === fiber.m?.children && !hasContextChanged(fiber, false)) {
        if (state.f) {
            renderFallback(state.f, props.fallback);
        }
        else {
            // Initial-mount suspended path: no committed primary to preserve.
            reconcileRaw(fiber, props.fallback);
        }
        fiber.m = props;
        return;
    }
    // Snapshot whether we have an existing committed primary tree before
    // attempting the new render. If the new attempt suspends and we did have a
    // committed primary, we keep it (hidden) rather than destroying it.
    const hadCommittedPrimary = fiber.m && fiber.c;
    state.u = false;
    const checkpoint = checkpointCommit(fiber);
    // Retried primary work belongs to this attempt, not its old hidden boundary.
    // The checkpoint restores these update targets if it suspends again.
    if (state.d)
        visitChildren(fiber, setUpdateBoundary, fiber.su, true);
    const prevHandler = suspendHandler;
    fiber.cx?.clear();
    let pendingThenable: any;
    suspendHandler = (thenable) => {
        pendingThenable = thenable;
    };
    try {
        if (process.env.NODE_ENV === 'production' || !(pendingThenable = devToolsSuspension(fiber))) reconcileRaw(fiber, props.children);
    }
    catch (error) {
        if (root?.h || !isThenable(error))
            throw error;
        pendingThenable = error;
    }
    finally {
        suspendHandler = prevHandler;
    }
    if (pendingThenable) {
        if (transitionRender && hadCommittedPrimary && !state.f && !isActivityHidden(fiber))
            throw pendingThenable;
        rewindCommit(checkpoint);
        state = (fiber.b ??= {}) as SuspenseState;
        const previousThenable = state.p;
        state.p = pendingThenable;
        const onSettle = () => {
            const current = fiber.b as SuspenseState | null;
            if (!current || current.p !== pendingThenable)
                return;
            current.p = null;
            scheduleRetry(fiber);
        };
        if (previousThenable !== pendingThenable)
            pendingThenable.then(onSettle, onSettle);
        // Rewind restored the committed tree, including its existing hidden state.
        // Only the first hide needs update-target, lifecycle and DOM work.
        if (hadCommittedPrimary && !state.d) {
            // Hide the primary subtree's root host doms so the fallback is the only
            // thing visible, but the underlying nodes (and their scroll/state/focus)
            // survive. Save original `display` for the resume path.
            const hidden: Array<[
                HTMLElement,
                string
            ]> = [];
            let c: Fiber | null = hadCommittedPrimary;
            while (c) {
                setUpdateBoundary(c, fiber);
                walkRetained(c, disconnectLayout);
                c = c.s;
            }
            c = hadCommittedPrimary;
            while (c) {
                hideRootHostDoms(c, hidden);
                c = c.s;
            }
            state.d = hidden;
        }
        else if (!hadCommittedPrimary) {
            // First-mount suspension — nothing to preserve.
            unmountAllChildren(fiber);
        }
        // Keep fallback identity across unsuccessful retries of an initial mount.
        const fallback = state.f ??= createFiber(FiberTag.Fragment, null, null, fiber);
        renderFallback(fallback, props.fallback);
    }
    else {
        state.p = null;
        fiber.cx?.clear();
        const wasHidden = !!state.d;
        // Render succeeded. Clean up any preserved-suspend state from a prior
        // suspension cycle: unhide primary, unmount the orphan fallback fiber.
        if (state.d) {
            visitChildren(fiber, setUpdateBoundary, fiber.su, true);
            const hidden = state.d;
            queueMutation(() => {
                for (const [el, origDisplay] of hidden)
                    el.style.display = origDisplay;
            });
            state.d = null;
        }
        if (state.f) {
            removeFiber(state.f);
            state.f = null;
        }
        if (wasHidden)
            for (let child = fiber.c; child; child = child.s)
                walkRetained(child, reconnectLayout, true);
    }
    fiber.m = props;
}
function renderFallback(fiber: Fiber, children: any): void {
    // Local updates remain independently queued, unless an outer hidden primary
    // owns them. Context must still cross an otherwise unchanged fallback.
    if (fiber.m && fiber.m.children === children && !fiber.su)
        renderContextConsumers(fiber);
    else {
        fiber.v = { children };
        renderNode(fiber);
    }
}
function realHandleSuspended(fiber: Fiber, thenable: Promise<any>): void {
    if (suspendHandler)
        return suspendHandler(thenable);
    const boundary = findSuspenseBoundary(fiber);
    if (boundary)
        throw new RenderSuspenseCapture(boundary);
    // Fallback: schedule re-render when promise settles
    defaultHandleSuspended(fiber, thenable);
}
registerTypeMatcher((type) => (type === REACT_SUSPENSE_TYPE ? FiberTag.Suspense : null));
installRenderer(FiberTag.Suspense, renderSuspense);
installCapability('h', realHandleSuspended);

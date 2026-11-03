import { readOwnerStack, runWithOwnerStack } from '../../../core/devtools';
import type { Fiber } from '../../../core';
import { checkpointCommit, rewindCommit, queueMutation, onCommitFailure, commitSynchronously } from '../../commit';
import { findRoot, unmountAllChildren, withCurrentRoot, runEffects, discardPendingWork, reconcileRaw, isThenable } from '../../reconcile';
import { HydrationCursor, setHydrationCursor, clearHydrationCursor, advanceCursorPast, isHydrationBailout } from '../hydration';
import { renderSuspense, scheduleRetry, retryHydration } from '../suspense/full';

function clearBoundaryRange(startMark: Comment, endMark: Comment): void {
    queueMutation(() => {
        let node = startMark.nextSibling;
        while (node && node !== endMark) {
            const next = node.nextSibling;
            (node as ChildNode).remove();
            node = next;
        }
    });
}
function rehydrateBoundary(fiber: Fiber): void {
    const state = fiber.b;
    if (!state?.b || !state.e)
        return;
    const root = findRoot(fiber);
    const parent = state.b.parentNode as Node;
    if (!(root && parent))
        return;
    // Both initial hydration and a streamed reveal adopt the same marked range.
    commitSynchronously(() => withCurrentRoot(root, () => {
        const previous = root.h;
        try {
            const kind = state.b.data.startsWith('$E') ? 3 : state.b.data.startsWith('$!') ? 2 : 0;
            if (!kind)
                unmountAllChildren(fiber);
            root.h = true;
            hydrateSuspenseBoundary(fiber, { ...fiber.v, children: state.r }, [kind, 0, state.b, state.e], true);
        }
        finally {
            root.h = previous;
        }
        runEffects(root);
    }));
}
function reportServerFailure(fiber: Fiber): void {
    const error = new Error(process.env.NODE_ENV !== 'production' ? 'Switched to client rendering because the server render did not complete.' : '');
    const handler = findRoot(fiber)?.re;
    if (handler) {
        if (process.env.NODE_ENV !== 'production') runWithOwnerStack(readOwnerStack(fiber), () => handler(error, { componentStack: null }));
        else handler(error, { componentStack: null });
    }
    else
        console.error(error);
}
export function recoverBoundaryHydration(fiber: Fiber, children: any, parent: Node, startMark: Comment | null, endMark: Comment | null, retryBoundary?: boolean): void {
    const clear = () => {
        if (startMark && endMark)
            clearBoundaryRange(startMark, endMark);
        else
            queueMutation(() => { parent.textContent = ''; });
    };
    const root = findRoot(fiber)!;
    const prevHydrating = root.h;
    if (!retryBoundary)
        discardPendingWork(root);
    clear();
    unmountAllChildren(fiber);
    root.h = false;
    try {
        if (retryBoundary) {
            fiber.b = { b: startMark, e: endMark };
            renderSuspense(fiber);
        }
        else
            reconcileRaw(fiber, children);
        if (endMark)
            advanceCursorPast(fiber.p!, endMark);
    }
    catch (clientError) {
        onCommitFailure(() => {
            clear();
            unmountAllChildren(fiber);
        });
        throw clientError;
    }
    finally {
        root.h = prevHydrating;
    }
}
export function hydrateSuspenseBoundary(fiber: Fiber, props: any, boundary: [
    0 | 1 | 2 | 3,
    number,
    Comment,
    Comment
], reveal?: boolean): void {
    const [pendingBoundary, id, startMark, endMark] = boundary;
    // Record the boundary shape so we can re-hydrate on reveal.
    fiber.b = {
        b: startMark,
        e: endMark,
        r: props.children,
    };
    if (pendingBoundary >= 2) {
        if (pendingBoundary === 3)
            reportServerFailure(fiber);
        recoverBoundaryHydration(fiber, props.children, startMark.parentNode!, startMark, endMark, true);
        fiber.m = props;
        return;
    }
    if (!pendingBoundary) {
        // Real DOM is inline between startMark and endMark. Hydrate into it.
        const checkpoint = checkpointCommit(fiber);
        const parent = startMark.parentNode!;
        try {
            setHydrationCursor(fiber, new HydrationCursor(parent, startMark.nextSibling, endMark));
            reconcileRaw(fiber, props.children);
            advanceCursorPast(fiber.p!, endMark);
        }
        catch (e) {
            // A marked boundary owns a known server range. Roll back only its
            // unfinished preparation so siblings can hydrate while it waits.
            if (isThenable(e)) {
                rewindCommit(checkpoint);
                fiber.b.w = true;
                retryHydration(fiber, e);
                advanceCursorPast(fiber.p!, endMark);
            }
            else if (!isHydrationBailout(e)) {
                onCommitFailure(() => {
                    clearBoundaryRange(startMark, endMark);
                    unmountAllChildren(fiber);
                });
                throw e;
            }
            else recoverBoundaryHydration(fiber, props.children, parent, startMark, endMark);
        }
        finally {
            clearHydrationCursor(fiber);
        }
        fiber.m = props;
        return;
    }
    if (startMark.data === '$?' || startMark.data === '$~') {
        // React owns this pending server range until its reveal script runs.
        // Hydrating the fallback would consume the transport template as a host.
        fiber.b.w = true;
        (startMark as any)._reactRetry = () => {
            if (!fiber.u)
                scheduleRetry(fiber);
        };
        advanceCursorPast(fiber.p!, endMark);
        fiber.m = props;
        return;
    }
    // Pending: fallback DOM lives inside <div id="B:ID">. Hydrate the fallback
    // React subtree against that div's children.
    const bDiv = document.getElementById(`B:${id}`);
    try {
        if (bDiv) {
            setHydrationCursor(fiber, new HydrationCursor(bDiv));
            reconcileRaw(fiber, props.fallback);
        }
        else {
            // Couldn't find fallback container — render fresh (non-adopting)
            reconcileRaw(fiber, props.fallback);
        }
    }
    catch (e) {
        if (!isHydrationBailout(e) || !bDiv)
            throw e;
        recoverBoundaryHydration(fiber, props.fallback, bDiv, null, null);
    }
    finally {
        clearHydrationCursor(fiber);
    }
    advanceCursorPast(fiber.p!, endMark);
    (globalThis as any).$RH?.(id, () => rehydrateBoundary(fiber));
    // If the inline runtime isn't present, nothing external will mark us dy.
    fiber.m = props;
}

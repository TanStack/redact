import { isTextContent } from '../core/functions';
import { devToolsMetadata, readOwnerStack, runWithOwnerStack } from '../core/devtools';
import { getRootContainer } from './root-internal';
export { getHostParent, findRoot, getAnchor, firstDomNode } from './tree';
export { isThenable } from '../core/functions';
import { HOOK_BAILOUT, renderWithHooks } from './dispatcher';
import { isString } from "../core/functions";
import { getHostParent, findRoot, getAnchor, firstDomNode } from './tree';
import { resourceKind } from '../core/resource-hints';
import { ReactSharedInternals, REACT_LAZY_TYPE, REACT_STRICT_MODE_TYPE, REACT_PROFILER_TYPE, REACT_VIEW_TRANSITION_TYPE, } from '../react';
import { componentStack } from './error-info';
import { syncInputValue, syncTextareaValue, syncSelectValue } from './form-controls';
export { deferHydration } from './features/hydration';
import { m as markTransitionUpdate, d as deferTransition, c as cancelTransitions, l as deferTransitionLayout, p as deferTransitionPassive } from './features/view-transition';
import { clearAttributes, clearHostContainer, documentMetadataParent, documentSingleton, DOCUMENT_HEAD_TAGS } from './document-metadata';
import { acquireResource } from './resources';
import { a as transitionRender, p as hasTransition, t as flushTransitions, c as cancelPendingTransitions, s as scheduleTransitionRoot } from './features/suspense-runtime';
import { commitFragmentRef, placeFragmentCommits, updateFragmentHost, refreshFragmentInstances } from './features/fragment-refs';
import { isObject } from '../core/functions';
import { FiberTag, createFiber, REACT_ELEMENT_TYPE, REACT_LEGACY_ELEMENT_TYPE, REACT_FRAGMENT_TYPE, type Fiber, type FiberRoot, type ReactElement, type ReactNode, type Effect, type Hook, } from '../core';
import { createHostNode, setProp } from './dom';
import { rememberRefreshRender, scheduleRefreshRoot, commitRefreshRoot, failRefreshRoot, failRefreshBoundary, resolveRefreshType, sameRefreshFamily, needsRefreshRemount } from './refresh';
import { forkId, assignReactIds, deferHydration, queueHydrationEnd, finishHydration, adoptHostDom, adoptTextDom, setHydrationCursor, getHydrationCursor, clearHydrationCursor, findHostParent as findHydrationHost, abortHydration, recoverHydration, isHydrationBailout, resumeHydration, } from './features/hydration';
import { rememberRetainedEffect, setRetainedFlag, disconnectClass } from './retained-effects';
import { readThenable } from '../react/thenable';
import { bindForm } from './form-actions';
// ---------------------------------------------------------------------------
// Render scheduling
// ---------------------------------------------------------------------------
let currentRoot: FiberRoot | null = null;
let flushing = false;
let isBatching = false;
const pendingRoots = new Set<FiberRoot>();
// Set by rerenderFiber to identify the exact memo-tagged fiber whose INTERNAL
// state (hook update, useSyncExternalStore notification) triggered this render
// pass. renderMemo checks this to bypass its prop-equality gate for that fiber.
// Without the bypass, a memo bail would swallow state changes: React's memo is
// only a parent-triggered gate — state-driven rerenders must always run the
// inner function. Router-adjacent components (Outlet, Match, MatchInner) are
// all memo-wrapped and subscribe to stores; missing this bypass breaks nav
// content updates even though the URL changes.
let forceRerenderingFiber: Fiber | null = null;
// ---------------------------------------------------------------------------
// Fiber creation
// ---------------------------------------------------------------------------
function tagForType(type: any, fallback = FiberTag.Host): FiberTag {
    if (isString(type))
        return FiberTag.Host;
    if (type === REACT_FRAGMENT_TYPE || type === REACT_STRICT_MODE_TYPE || type === REACT_PROFILER_TYPE || type === REACT_VIEW_TRANSITION_TYPE)
        return FiberTag.Fragment;
    const marker = type?.$$typeof;
    for (const match of TYPE_MATCHERS) {
        const tag = match(type, marker);
        if (tag !== null)
            return tag;
    }
    return isFunction(type)
        ? type.prototype?.isReactComponent ? FiberTag.Class : FiberTag.Function
        : fallback;
}
export function registerElementMarker(sym: symbol): void {
    ACCEPTED_ELEMENT_MARKERS.add(sym);
}
function collectHostDoms(fiber: Fiber, out: Node[]): void {
    if (fiber.t === FiberTag.Suspense && fiber.b?.w) {
        let node: Node | null = fiber.b.b;
        while (node) {
            out.push(node);
            if (node === fiber.b.e)
                break;
            node = node.nextSibling;
        }
        return;
    }
    if (fiber.t <= FiberTag.Text) {
        if (fiber.n && !documentMetadataParent(fiber))
            out.push(fiber.n);
        return;
    }
    if (fiber.t === FiberTag.Portal)
        return;
    let c = fiber.c;
    while (c) {
        collectHostDoms(c, out);
        c = c.s;
    }
    if (fiber.t === FiberTag.Suspense && fiber.b?.f)
        collectHostDoms(fiber.b.f, out);
}
export function stageCommit(fiber: Fiber, work: Effect | (() => void), ref = false): void {
    let entries = stagedCommits.get(fiber);
    if (!entries) {
        stagedCommits.set(fiber, entries = []);
    }
    entries.push([fiber, work, ref]);
}
function markPendingDeletion(fiber: Fiber, deleted: Fiber[]): void {
    if (fiber.pd)
        return;
    fiber.pd = true;
    deleted.push(fiber);
    for (let child = fiber.c; child; child = child.s)
        markPendingDeletion(child, deleted);
    if (fiber.t === FiberTag.Suspense && fiber.b?.f)
        markPendingDeletion(fiber.b.f, deleted);
}
function resolvedType(type: any): any {
    return type?.$$typeof === REACT_LAZY_TYPE ? resolvedType(type._init(type._payload))
        : process.env.NODE_ENV !== 'production' ? resolveRefreshType(type) : type;
}
export function childrenToArray(children: ReactNode): NormalizedChild[] {
    const out: NormalizedChild[] & {
        ip?: bigint[];
    } = [];
    const ids = currentRoot?.h && currentRoot.ri ? [] as bigint[] : undefined;
    pushChildren(children, out, ids);
    if (ids)
        out.ip = ids;
    return out;
}
// ---------------------------------------------------------------------------
// DOM navigation helpers
// ---------------------------------------------------------------------------
export const fiberDepth = (fiber: Fiber): number => (fiber.d ??= fiber.p ? fiberDepth(fiber.p) + 1 : 0);
function pushChildren(node: ReactNode, out: NormalizedChild[], ids?: bigint[], path = 1n): void {
    if (node == null || typeof node === 'boolean' || node === '') {
        out.push(null);
        ids?.push(path);
        return;
    }
    if (isTextContent(node)) {
        if (node !== '') {
            out.push('' + node);
            ids?.push(path);
        }
        return;
    }
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++)
            pushChildren(node[i], out, ids, ids ? forkId(path, node.length, i) : path);
        return;
    }
    if (isObject(node)) {
        const t = (node as any).$$typeof;
        if (ACCEPTED_ELEMENT_MARKERS.has(t)) {
            out.push(node as ReactElement);
            ids?.push(path);
            return;
        }
        // Raw React.lazy as a child. RSC Flight encodes 'use client' components
        // (CodeBlock, CodeExplorer, etc.) as bare Lazy objects in the tree, not
        // wrapped in REACT_ELEMENT_TYPE. Dropping them made code snippets
        // disappear from docs pages. The RSC decoder pre-awaits payloads via
        // `awaitLazyElements`, so by render time the status is 'fulfilled' and
        // `_init()` returns the resolved element synchronously.
        if (t === REACT_LAZY_TYPE || isThenable(node)) {
            pushChildren(t === REACT_LAZY_TYPE ? resolvedType(node) : readThenable(node as unknown as PromiseLike<ReactNode>), out, ids, path);
            return;
        }
    }
    if (isIterable(node)) {
        if (ids)
            pushChildren(Array.from(node as Iterable<ReactNode>), out, ids, path);
        else
            for (const item of node as Iterable<ReactNode>)
                pushChildren(item, out);
    }
}
export function scheduleLifecycle(fiber: Fiber, fn: () => void): void {
    if (isActivityHidden(fiber) || layoutIsDisconnected(fiber))
        return;
    stageCommit(fiber, fn);
}
// ---------------------------------------------------------------------------
// Element → children normalization
// ---------------------------------------------------------------------------
// Text children pass through as raw strings — no wrapper. The previous
// `{_text: string}` shape allocated tens of thousands of objects per
// stable-list re-render and dominated minor-GC pressure. `typeof === 'string'`
// is also robust to RSC renderable proxies (which have `has` traps that
// would fool a `'_text' in child` predicate but can't fool `typeof`).
type NormalizedChild = ReactElement | string | null;
function captureRootError(root: FiberRoot, stack: string, error: unknown): void {
    if (process.env.NODE_ENV !== 'production')
        failRefreshRoot(root);
    const errors = root.er ||= [];
    if (!errors.length)
        root.u = undefined;
    errors.push({ error, stack });
    if (process.env.NODE_ENV !== 'production') errors[errors.length - 1]!.ownerStack = devToolsMetadata.errorStack ?? null;
    scheduleUpdate(root.r);
}
function captureError(capture: RenderErrorCapture): void {
    const fiber = capture.b;
    if (process.env.NODE_ENV !== 'production')
        failRefreshBoundary(fiber);
    fiber.b = { ...fiber.b, error: capture };
    scheduleUpdate(fiber);
}
const isIterable = (obj: any): boolean => (isFunction(obj[Symbol.iterator]));
function flushRoot(root: FiberRoot): void {
    if (root.er) {
        flushRootErrors(root);
        return;
    }
    const render = root.u;
    root.u = undefined;
    if (render)
        render();
    // Ancestors run first, but keep descendants in the queue: an ancestor can
    // bail out without reaching a descendant's independently scheduled update.
    const pending = [...root.p];
    root.p.clear();
    renderUpdates(root, pending);
    flushTransitions?.(root, renderUpdates);
    runEffects(root);
    if (process.env.NODE_ENV !== 'production') commitRefreshRoot(root);
}
export function rememberActivityEffect(fiber: Fiber, hook: Hook, effect: Effect): void {
    if (fiber.r?.a || (fiber.r?.sp && effect.t === 1 && !effect.s))
        rememberRetainedEffect(fiber, hook, effect);
}
// ---------------------------------------------------------------------------
// Error handling + default Suspense capability
// ---------------------------------------------------------------------------
// Default handler when the Suspense feature isn't installed: just schedule
// a re-render when the thrown thenable settles. No boundary walk, no
// fallback swap — children render empty during the pending window.
export function defaultHandleSuspended(fiber: Fiber, thenable: Promise<any>): void {
    fiber.bs = true;
    const retry = () => scheduleUpdate(fiber);
    thenable.then(retry, retry);
}
export function detachRef(ref: any, fiber?: Fiber): void {
    if (ref && isObject(ref))
        queueMutation(() => invokeCommit(fiber, () => { ref.current = null; }));
}
export function withCurrentRoot<T>(root: FiberRoot | null, fn: () => T): T {
    const prev = currentRoot;
    currentRoot = root;
    try {
        return fn();
    }
    finally {
        currentRoot = prev;
    }
}
export function flushSyncWork(fn: () => void): void {
    cancelTransitions && cancelTransitions();
    const transition = ReactSharedInternals.T;
    ReactSharedInternals.T = null;
    const wasBatching = isBatching;
    isBatching = true;
    try {
        fn();
        // Include transitions started inside the synchronous callback.
        cancelTransitions && cancelTransitions();
        isBatching = wasBatching;
        flushPending();
    }
    finally {
        isBatching = wasBatching;
        ReactSharedInternals.T = transition;
    }
}
export function syncRefIfChanged(fiber: Fiber, value: any): void {
    const ref = fiber.ref ?? (fiber.v?.ref ?? null);
    if (!ref && !fiber.cr)
        return;
    if (isActivityHidden(fiber) || layoutIsDisconnected(fiber))
        return;
    const previous = fiber.cr ?? null;
    if (previous !== ref) {
        const cleanup = fiber.rc;
        queueMutation(() => {
            if (cleanup) {
                fiber.rc = null;
                disposeCleanup(fiber, cleanup);
            }
            detachRef(previous, fiber);
            fiber.cr = null;
        });
        attachRef(fiber, value);
    }
    else if (ref && isObject(ref) && ref.current !== value)
        attachRef(fiber, value);
}
export function unmountAllChildren(parent: Fiber): void {
    let c = parent.c;
    while (c) {
        const next = c.s;
        removeFiber(c);
        c = next;
    }
    parent.c = null;
}
function fiberFromChild(child: Exclude<NormalizedChild, null>, parent: Fiber): Fiber {
    const text = isString(child);
    const type = text ? null : process.env.NODE_ENV !== 'production' ? resolveRefreshType(child.type) : child.type;
    const fiber = createFiber(text ? FiberTag.Text : tagForType(type), type, text ? null : child.key ?? null);
    fiber.ref = text ? null : (child as any).ref ?? null;
    fiber.v = text ? child : child.props;
    if (process.env.NODE_ENV !== 'production' && !text) rememberDevToolsFiber(fiber, child);
    fiber.p = parent;
    if (currentCommit?.c.length)
        onCommitRollback(() => { fiber.u = true; });
    return fiber;
}
function getDocumentInsertionParent(parent: Node, node: Node): HTMLElement | null {
    if (parent.nodeType !== 9 || node.nodeType !== 1)
        return null;
    const tag = (node as Element).tagName.toLowerCase();
    if (tag === 'html')
        return null;
    return DOCUMENT_HEAD_TAGS.test(tag) ? (parent as Document).head : (parent as Document).body;
}
// ---------------------------------------------------------------------------
// Rendering per fiber tag
// ---------------------------------------------------------------------------
export type RenderFn = (fiber: Fiber) => void;
export type TypeMatcher = (type: any, marker: any) => FiberTag | null;
// Mutable renderer registry indexed by FiberTag. Feature modules install their
// renderer via installRenderer(); unregistered features render as no-ops. The
// initial registrations below rely on function-declaration hoisting — every
// render* function is declared with `function` later in this file.
const RENDERERS: Array<RenderFn | undefined> = new Array(13);
// Element-marker allowlist for child normalization (pushChildren). Core-always
// markers are seeded here; features add their own via registerElementMarker.
const ACCEPTED_ELEMENT_MARKERS = new Set<symbol>([
    REACT_ELEMENT_TYPE as symbol,
    REACT_LEGACY_ELEMENT_TYPE as symbol,
]);
// Type-to-tag matchers tried in registration order from fiberFromChild's
// fallback branch. Features register here for element types that aren't
// marker-based (e.g. Portal, where element.type IS the symbol).
const TYPE_MATCHERS: TypeMatcher[] = [];
function renderUpdates(root: FiberRoot, pending: Fiber[], update?: () => void): void {
    pending.sort((a, b) => fiberDepth(a) - fiberDepth(b));
    if (transitionRender)
        for (const fiber of pending)
            fiber.g = true;
    update?.();
    for (const fiber of pending) {
        if (!fiber.g || fiber.u || fiber.pd)
            continue;
        // An ancestor earlier in this batch may have retained this subscriber.
        if (fiber.su) {
            scheduleUpdate(fiber);
            continue;
        }
        if (!transitionRender) {
            if (fiber.bt && hasTransition?.(fiber))
                continue;
            let ancestor = fiber.p;
            while (ancestor && !ancestor.bs)
                ancestor = ancestor.p;
            if (ancestor && fiber.bt)
                continue;
        }
        const boundary = root.eb && findErrorBoundary(fiber);
        const checkpoint = boundary || (root.sp && findSuspenseBoundary(fiber)) ? checkpointCommit(fiber) : -1;
        try {
            rerenderFiber(fiber, root);
        }
        catch (error) {
            if (error instanceof RenderSuspenseCapture) {
                rewindCommit(checkpoint);
                error.b.b.u = true;
                scheduleUpdate(error.b);
                continue;
            }
            if (error instanceof RenderErrorCapture) {
                if (error.b.t === FiberTag.Root)
                    throw error;
                rewindCommit(checkpoint);
                captureError(error);
                continue;
            }
            if (!recoverHydration(root, error))
                throw error;
            break;
        }
    }
}
// ---------------------------------------------------------------------------
// Refs
// ---------------------------------------------------------------------------
export function attachRef(fiber: Fiber, value: any): void {
    const ref = fiber.ref ?? (fiber.v?.ref ?? null);
    if (!ref)
        return;
    if (isActivityHidden(fiber) || layoutIsDisconnected(fiber))
        return;
    stageCommit(fiber, () => {
        if (fiber.t === FiberTag.Resource)
            value = fiber.i;
        fiber.cr = ref;
        if (isFunction(ref)) {
            // Callback refs run during commit, after insertion effects install
            // event callback implementations and in subtree layout order.
            const cleanup = ref(value);
            const detach = isFunction(cleanup) ? cleanup : () => ref(null);
            fiber.rc = detach;
            (fiber.e ||= []).push(detach);
        }
        else {
            ref.current = value;
        }
    }, true);
}
export function enqueueEffect(fiber: Fiber, effect: Effect): void {
    if (effect.t !== 2 && (isActivityHidden(fiber) || activityIsDisconnected(fiber) || (effect.t === 1 && !effect.s && fiber.ld)))
        return;
    if (effect.t === 2)
        pendingInsertionEffects.push([fiber, effect]);
    else if (effect.t === 1)
        stageCommit(fiber, effect);
    else
        pendingEffects.push([fiber, effect]);
}
// Accessor + scoped setter for the module-level `currentRoot`. Feature modules
// need these to participate in the render loop (e.g. Suspense re-hydration
// must temporarily set the root while rebuilding a boundary subtree).
export const getCurrentRoot = (): FiberRoot | null => (currentRoot);
function sameType(fiber: Fiber, child: Exclude<NormalizedChild, null>): boolean {
    if (isString(child))
        return fiber.t === FiberTag.Text;
    if (process.env.NODE_ENV !== 'production' && sameRefreshFamily(fiber.type, child.type))
        return (fiber.key === (child.key ?? null));
    return fiber.key === (child.key ?? null) && (fiber.type === child.type || resolvedType(fiber.type) === resolvedType(child.type));
}
// The memo feature uses this to bypass its prop-equality gate on state-driven
// rerenders of the memoized fiber itself (hook update / subscribed store),
// where props haven't changed by definition.
export const getForceRerenderingFiber = (): Fiber | null => (forceRerenderingFiber);
installRenderer(FiberTag.Text, renderText);
installRenderer(FiberTag.Host, renderHost);
installRenderer(FiberTag.Resource, renderHost);
installRenderer(FiberTag.Function, renderFunction);
installRenderer(FiberTag.Fragment, renderFragment);
function placeDomsInOrder(doms: Node[], domParent: Node): void {
    // Document siblings can be projected into head or body by the HTML parser.
    // Keep them in their physical container when their logical parent is Document.
    if (domParent.nodeType === 9) {
        const doc = domParent as Document;
        const bodyNodes = doms.filter(node => getDocumentInsertionParent(doc, node) === doc.body);
        if (bodyNodes.length)
            placeDomsInOrder(bodyNodes, doc.body);
        doms = doms.filter(node => !getDocumentInsertionParent(doc, node));
    }
    // Build fresh siblings in document order so native controls choose the first option.
    if (doms.every(node => !node.parentNode)) {
        for (const node of doms)
            domParent.appendChild(node);
        return;
    }
    // Reverse-iterate, anchoring each node before the one that should follow it.
    // This works because by the time we're placing doms[i], doms[i+1] is already
    // in its final slot. Forward iteration is buggy: insertBefore(doms[i],
    // doms[i+1]) pulls doms[i] forward past any nodes that SHOULD move behind
    // it, leaving those nodes mis-anchored (app-starter Analyze/Lucky swap, npm
    // stats library dropdown reorder — both reported by users).
    //
    // Concrete example: start=[A, R, L], target=[A, L, R]. Forward pass gives
    // [L, A, R] (wrong). Reverse pass moves R to end, then L and A are already
    // correct — 1 move, matches target.
    //
    // Skip nodes already in their target position so CSS transitions on stable
    // siblings aren't cancelled (e.g. drawer slide animation).
    for (let i = doms.length - 1; i >= 0; i--) {
        const d = doms[i]!;
        const targetNext: Node | null = doms[i + 1] ?? null;
        if (d.parentNode !== domParent || (targetNext && !(d.compareDocumentPosition(targetNext) & 4))) {
            domParent.insertBefore(d, targetNext);
        }
    }
}
export function handleErrorInRender(fiber: Fiber, err: any): void {
    if (err instanceof RenderErrorCapture)
        throw err;
    stagedCommits.delete(fiber);
    removeEffects(candidate => candidate === fiber);
    if (currentRoot?.h && findHydrationHost(fiber).hc) {
        abortHydration(err, fiber);
    }
    // Bubble to nearest class boundary with getDerivedStateFromError / componentDidCatch
    const boundary = findErrorBoundary(fiber);
    if (boundary) {
        const capture = new RenderErrorCapture(boundary, err, fiber);
        if (currentCommit)
            throw capture;
        captureError(capture);
        return;
    }
    // Abort the prepared render. Its mutation/effect queues must not commit
    // before the root is cleared and the error callback runs.
    const root = currentRoot ?? findRoot(fiber);
    if (root && currentCommit && (flushing || root.ue))
        throw new RenderErrorCapture(root.r, err, fiber);
    if (root?.ue) {
        if (process.env.NODE_ENV !== 'production') runWithOwnerStack(readOwnerStack(fiber), () => root.ue!(err, { componentStack: componentStack(fiber) }));
        else root.ue(err, { componentStack: componentStack(fiber) });
    }
    else
        throw err;
}
export function handleCommitError(fiber: Fiber, error: unknown): void {
    const boundary = findErrorBoundary(fiber);
    if (boundary) {
        captureError(new RenderErrorCapture(boundary, error, fiber));
        return;
    }
    const root = findRoot(fiber);
    if (root) {
        if (process.env.NODE_ENV !== 'production') runWithOwnerStack(readOwnerStack(fiber), () => captureRootError(root, componentStack(fiber), error));
        else captureRootError(root, componentStack(fiber), error);
    } else
        queueMicrotask(() => { throw error; });
}
export function invokeCommit<T>(fiber: Fiber | undefined, callback: () => T): T | undefined {
    try {
        if (process.env.NODE_ENV !== 'production' && fiber) return invokeDevToolsCallback(fiber, callback);
        return callback();
    }
    catch (error) {
        if (!fiber) throw error;
        handleCommitError(fiber, error);
    }
}
export function renderFunction(fiber: Fiber, render = fiber.type, props = fiber.v ?? {}, ref?: any): void {
    const canBail = fiber === forceRerenderingFiber && fiber.v === fiber.m;
    fiber.cx?.clear();
    let rendered: ReactNode | typeof HOOK_BAILOUT;
    try {
        rendered = renderWithHooks(fiber, render, props, ref, canBail);
    }
    catch (e: any) {
        if (isThenable(e)) {
            if (!deferHydration(fiber, e))
                handleSuspended(fiber, e);
        }
        else
            handleErrorInRender(fiber, e);
        return;
    }
    if (rendered === HOOK_BAILOUT)
        return;
    reconcileRaw(fiber, rendered);
    fiber.m = fiber.v;
    // dy cleared at rerender start; leaving true lets mid-render schedule persist
}
export function registerTypeMatcher(m: TypeMatcher): void {
    TYPE_MATCHERS.push(m);
}
function collectChildren(parent: Fiber): Fiber[] {
    const out: Fiber[] = [];
    let c = parent.c;
    while (c) {
        out.push(c);
        c = c.s;
    }
    return out;
}
function removeEffects(matches: (fiber: Fiber) => boolean): void {
    for (const queue of effectQueues) {
        for (let index = queue.length - 1; index >= 0; index--) {
            if (matches(queue[index]![0]))
                (function (queue: Array<[
                    Fiber,
                    Effect
                ] | LayoutCommit>, index: number): void {
                    const entry = queue[index]!;
                    queue.splice(index, 1);
                    if (currentCommit?.c.length)
                        onCommitRollback(() => { queue.splice(index, 0, entry); });
                })(queue, index);
        }
    }
}
function renderText(fiber: Fiber): void {
    const domParent = getHostParent(fiber);
    const text = fiber.v as string;
    // Native form reset replaces an <output>'s text node. Reattach the fiber to
    // the replacement before writing, otherwise updates target a detached node.
    if (fiber.n && fiber.m !== null && !fiber.n.parentNode &&
        domParent.firstChild?.nodeType === 3 && !domParent.firstChild.nextSibling) {
        fiber.n = domParent.firstChild;
    }
    // Identity-unchanged fast path: skip the native Text.data write entirely.
    if (fiber.n && fiber.m === text)
        return;
    if (!fiber.n) {
        const hydrated = currentRoot?.h ? adoptTextDom(fiber, fiber.p!, text) : false;
        if (!hydrated) {
            fiber.n = document.createTextNode(text);
        }
        updateFragmentHost(fiber, true);
    }
    else {
        // Past the fast path, and adoptTextDom already realigned `.data` on
        // hydration — `.data !== text` here is guaranteed, so write directly.
        queueText(fiber.n as Text, text);
    }
    fiber.m = text;
    // dy cleared at rerender start; leaving true lets mid-render schedule persist
}
// ---------------------------------------------------------------------------
// Capability hooks — cross-cutting behaviors that features override.
// Defaults here preserve today's behavior so the indirection is transparent
// when all features are loaded. A feature's full-module can install its own
// implementation via installCapability(); stubs leave the default in place,
// where the default may intentionally degrade (e.g. a no-Context build's
// readContext never walks the tree because no Provider fibers exist).
// ---------------------------------------------------------------------------
export interface Capabilities {
    h: (fiber: Fiber, thenable: Promise<any>) => void;
    c: (fiber: Fiber, ctx: any) => any;
    i: (fiber: Fiber) => boolean;
    d: (fiber: Fiber) => boolean;
    p: (fiber: Fiber) => void;
    s: (fiber: Fiber) => void;
}
const CAPABILITIES: Capabilities = {
    h: defaultHandleSuspended,
    c: defaultReadContext,
    i: () => false,
    d: () => false,
    p: () => { },
    s: () => { },
};
export const isActivityHidden = (fiber: Fiber): boolean => CAPABILITIES.i(fiber);
export const activityIsDisconnected = (fiber: Fiber): boolean => CAPABILITIES.d(fiber);
export const layoutIsDisconnected = (fiber: Fiber): boolean => (!!fiber.ld || activityIsDisconnected(fiber));
export function discardPendingWork(root: FiberRoot): void {
    cancelPendingTransitions?.(root);
    root.u = undefined;
    root.p.clear();
    root.s = false;
    pendingRoots.delete(root);
}
function runEffect(fiber: Fiber, effect: Effect): void {
    if (fiber.u)
        return;
    if (effect.t !== 2 && (isActivityHidden(fiber) || activityIsDisconnected(fiber) || (effect.t === 1 && !effect.s && fiber.ld)))
        return;
    const cleanup = invokeCommit(fiber, effect.c);
    if (isFunction(cleanup))
        (fiber.e ||= []).push(cleanup);
}
export class RenderSuspenseCapture {
    constructor(public b: Fiber) { }
}
export function scheduleRootRender(root: FiberRoot, render: () => void): void {
    if (process.env.NODE_ENV !== 'production')
        rememberRefreshRender(root, render);
    markTransitionUpdate && markTransitionUpdate(root);
    if (!scheduleTransitionRoot?.(root, render)) root.u = render;
    pendingRoots.add(root);
    if (isBatching)
        return;
    if (process.env.NODE_ENV !== 'production' && ReactSharedInternals.A)
        ReactSharedInternals.A.push(flushPending);
    else
        flushPending();
}
export class RenderErrorCapture {
    s: string;
    declare o?: string | null;
    constructor(public b: Fiber, public e: unknown, source: Fiber = b) {
        this.s = componentStack(source);
        if (process.env.NODE_ENV !== 'production') this.o = readOwnerStack(source);
    }
}
function flushRootErrors(root: FiberRoot): void {
    const errors = root.er!;
    root.er = undefined;
    if (root.r.m === null)
        queueMutation(() => clearHostContainer(root.c));
    renderRoot(root, null);
    queueCommitEffects(() => {
        for (const captured of errors) {
            try {
                if (process.env.NODE_ENV !== 'production' && ReactSharedInternals.A) {
                    ReactSharedInternals.A.push(() => { throw captured.error; });
                }
                else if (root.ue) {
                    if (process.env.NODE_ENV !== 'production') runWithOwnerStack(captured.ownerStack ?? null, () => root.ue!(captured.error, { componentStack: captured.stack }));
                    else root.ue(captured.error, { componentStack: captured.stack });
                }
                else if (isFunction(globalThis.reportError))
                    globalThis.reportError(captured.error);
                else
                    queueMicrotask(() => { throw captured.error; });
            }
            catch (error) {
                setTimeout(() => { throw error; });
            }
        }
    });
    if (root.u)
        pendingRoots.add(root);
}
function flushPending(): void {
    if (flushing)
        return;
    flushing = true;
    try {
        let guard = 0;
        while (pendingRoots.size > 0) {
            if (++guard > 50) {
                if (process.env.NODE_ENV !== 'production') {
                    throw new Error('flushPending exceeded 50 iterations — suspected infinite update loop.');
                }
                throw new Error();
            }
            const roots = [...pendingRoots];
            pendingRoots.clear();
            for (const root of roots) {
                root.s = false;
                const render = () => flushRoot(root);
                if (!(deferTransition && deferTransition(root, render, flushPending))) {
                    try {
                        commitSynchronously(render);
                    }
                    catch (error) {
                        if (!recoverRootError(error))
                            throw error;
                    }
                }
            }
        }
    }
    finally {
        flushing = false;
    }
}
export function batchedUpdates<T>(fn: () => T): T;
export function batchedUpdates<A, T>(fn: (arg: A) => T, arg: A): T;
export function batchedUpdates<T>(fn: (arg: any) => T, arg?: any): T {
    const wasBatching = isBatching;
    isBatching = true;
    try {
        return fn(arg);
    }
    finally {
        isBatching = wasBatching;
        if (!wasBatching)
            flushPending();
    }
}
// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------
/**
 * Reconcile a parent fiber's child list against new normalized children.
 * Mutates parent.c and the sibling chain.
 * DOM placement runs after mutations and before layout effects.
 */
export function reconcileChildren(parent: Fiber, nodes: Parameters<typeof reconcile>[1], _domParent: Node, _anchor: Node | null): void { reconcile(parent, nodes); }
export function installRenderer(tag: FiberTag, fn: RenderFn): void {
    RENDERERS[tag] = fn;
}
function findErrorBoundary(fiber: Fiber): Fiber | null {
    for (let parent = fiber.p; parent; parent = parent.p) {
        if (parent.u || parent.pd)
            continue;
        const instance = parent.i;
        if (instance?._f === parent && (parent.b?.b?.getDerivedStateFromError || instance.componentDidCatch))
            return parent;
    }
    return null;
}
export function disposeCleanup(fiber: Fiber, cleanup: () => void): void {
    const index = fiber.e?.indexOf(cleanup) ?? -1;
    if (index >= 0)
        fiber.e!.splice(index, 1);
    invokeCommit(fiber, cleanup);
}
export function installCapability<K extends keyof Capabilities>(name: K, fn: Capabilities[K]): void {
    CAPABILITIES[name] = fn;
}
// Preserve the extension helper signature while internal removals need no host argument.
export function unmountFiber(fiber: Fiber, _domParent: Node, remove = true): void { removeFiber(fiber, remove); }
function queueUnmount(fiber: Fiber, remove: boolean): void {
    if (fiber.pd)
        return;
    // Keep committed DOM available for snapshots, but stop deleted work now.
    const deleted: Fiber[] = [];
    markPendingDeletion(fiber, deleted);
    const restore = () => {
        for (const child of deleted)
            child.pd = false;
    };
    onCommitRollback(restore);
    onCommitFailure(restore);
    queueMutation(() => removeFiber(fiber, remove));
}
export function runEffects(root: FiberRoot): void {
    if (root.fr)
        refreshFragmentInstances(root);
    if (effectQueues.some(queue => queue.length))
        (function (): void {
            const batches = effectQueues.map(queue => queue.splice(0));
            const [batch, insertion, layout] = batches as [
                Array<[
                    Fiber,
                    Effect
                ]>,
                Array<[
                    Fiber,
                    Effect
                ]>,
                LayoutCommit[]
            ];
            if (currentCommit?.c.length)
                onCommitRollback(() => {
                    // A nested render can drain these queues before an enclosing attempt
                    // fails. Reuse the captured batches, then older checkpoints trim tails.
                    effectQueues.forEach((queue, index) => queue.unshift(...batches[index]!));
                });
            queueCommitEffects(() => {
                if (process.env.NODE_ENV !== 'production') measureDevToolsLayout(root, () => {
                    for (const [fiber, effect] of insertion) runEffect(fiber, effect);
                });
                else for (const [fiber, effect] of insertion) runEffect(fiber, effect);
                if (layout.length) {
                    if (process.env.NODE_ENV !== 'production') measureDevToolsLayout(root, () => {
                        for (const [fiber, work] of layout) {
                            if (!isFunction(work) && !fiber.u && !isActivityHidden(fiber) && !layoutIsDisconnected(fiber)) work.d?.();
                        }
                    });
                    else for (const [fiber, work] of layout) {
                        if (!isFunction(work) && !fiber.u && !isActivityHidden(fiber) && !layoutIsDisconnected(fiber)) work.d?.();
                    }
                    const runLayout = () => {
                        for (const [fiber, work] of layout) {
                            if (!isFunction(work))
                                runEffect(fiber, work);
                            else if (!fiber.u && !isActivityHidden(fiber) && !layoutIsDisconnected(fiber)) {
                                invokeCommit(fiber, work);
                            }
                        }
                    };
                    if (process.env.NODE_ENV !== 'production') {
                        const measured = wrapDevToolsLayout(root, runLayout);
                        if (!(deferTransitionLayout && deferTransitionLayout(measured))) measured();
                    } else if (!(deferTransitionLayout && deferTransitionLayout(runLayout))) runLayout();
                }
                // Passive fx on microtask
                if (batch.length) {
                    const passive = () => {
                        for (const [fiber, effect] of batch)
                            if (!fiber.u && !isActivityHidden(fiber) && !activityIsDisconnected(fiber)) effect.d?.();
                        for (const [fiber, effect] of batch)
                            runEffect(fiber, effect);
                    };
                    if (process.env.NODE_ENV !== 'production') {
                        const measured = wrapDevToolsPassive(root, passive);
                        if (!(deferTransitionPassive && deferTransitionPassive(measured))) {
                            if (ReactSharedInternals.A) ReactSharedInternals.A.push(measured);
                            else queueMicrotask(measured);
                        }
                    } else if (!(deferTransitionPassive && deferTransitionPassive(passive))) queueMicrotask(passive);
                }
            });
        })();
}
function renderFragment(fiber: Fiber): void {
    const props = fiber.v ?? {};
    reconcileRaw(fiber, props.children);
    commitFragmentRef(fiber);
    fiber.m = props;
    // dy cleared at rerender start; leaving true lets mid-render schedule persist
}
export function findSuspenseBoundary(fiber: Fiber): Fiber | null {
    let child = fiber;
    for (let parent = fiber.p; parent; parent = parent.p) {
        // Include the starting fiber: promised Activity children can suspend
        // while normalizing the Activity itself, before a child fiber exists.
        if (child.t === FiberTag.Activity && child.v?.mode === 'hidden')
            return null;
        if (parent.t === FiberTag.Suspense && parent.b?.f !== child)
            return parent;
        child = parent;
    }
    return null;
}
// ---------------------------------------------------------------------------
// Entry points (called by createRoot)
// ---------------------------------------------------------------------------
export function renderRoot(root: FiberRoot, children: ReactNode): void {
    if (!currentCommit)
        return commitSynchronously(() => renderRoot(root, children));
    if (process.env.NODE_ENV !== 'production')
        scheduleRefreshRoot(root, children);
    const rootFiber = root.r;
    rootFiber.v = { children };
    currentRoot = root;
    try {
        reconcileRaw(rootFiber, children);
        rootFiber.m = rootFiber.v;
        rootFiber.g = false;
    }
    finally {
        currentRoot = null;
    }
    // Layout effects can synchronously update stores, after hydration has ended.
    queueHydrationEnd?.(root);
    runEffects(root);
    if (process.env.NODE_ENV !== 'production')
        commitRefreshRoot(root);
}
// ---------------------------------------------------------------------------
// Context read — exported for dispatcher.ts (useContext, use()). Delegates to
// the installed capability so the Context feature can override with a walking
// implementation that finds the nearest Provider fiber. When the feature is
// stubbed, the default here returns ctx._currentValue — correct because no
// Provider fibers exist in the tree (Provider element → Fragment via the
// stub's type matcher).
// ---------------------------------------------------------------------------
export const readContext = (fiber: Fiber, ctx: any): any => (CAPABILITIES.c(fiber, ctx));
function rerenderFiber(fiber: Fiber, root: FiberRoot): void {
    if (!fiber.g)
        return;
    // Skip fibers that were um between scheduling and flush. Without this,
    // the flush loop re-enters a zombie fiber whose .p is still set; its
    // render mounts fresh DOM into the old parent's still-attached DOM (since
    // removeFiber only clears fiber.c, not fiber.p). Visible as route
    // content from a previous location staying on screen after nav, because a
    // pending rerender on the old route's LibraryLandingPage (um during
    // Outlet's shallow-first render) still fires from root.pending.
    if (fiber.u || fiber.pd)
        return;
    // Clear BEFORE rendering so a scheduleUpdate() triggered mid-render (e.g.
    // error boundary catching a descendant throw) marks us dy for the next
    // flush iteration instead of being wiped out when render() completes.
    fiber.g = false;
    currentRoot = root;
    const finishHydration = resumeHydration(fiber, root);
    const prevForcing = forceRerenderingFiber;
    forceRerenderingFiber = fiber;
    try {
        renderNode(fiber);
    }
    finally {
        forceRerenderingFiber = prevForcing;
        finishHydration?.();
        currentRoot = null;
    }
}
function renderHost(fiber: Fiber): void {
    const domParent = documentMetadataParent(fiber) || getHostParent(fiber);
    const hadDom = !!fiber.n;
    const props = fiber.v ?? {};
    const prev = fiber.m;
    const type = fiber.type as string;
    const isSvg = type === 'svg' || (domParent as Element).namespaceURI === 'http://www.w3.org/2000/svg';
    const singleton = !isSvg && documentSingleton(fiber);
    const isResource = fiber.t === FiberTag.Resource;
    const canAcquire = !isSvg && (isResource || !fiber.m) && resourceKind(type, props);
    if (isResource || canAcquire) {
        fiber.t = FiberTag.Resource;
        if (canAcquire) {
            let container: Node = domParent.ownerDocument || domParent;
            if (type !== 'script') {
                // Host assembly may still be detached. Style ownership follows the
                // logical root or nearest portal, not that temporary DOM tree.
                container = getRootContainer(fiber, domParent);
            }
            queueMutation(() => {
                const resource = acquireResource(type, props, container);
                fiber.i ||= resource;
            });
        }
        if (fiber.m)
            syncRefIfChanged(fiber, fiber.i);
        else
            attachRef(fiber, null);
        fiber.m = props;
        return;
    }
    // <select value> must be applied AFTER children mount — setting `.value`
    // on a `<select>` with no matching `<option>` yet resets it to empty. Same
    // for `defaultValue` on first mount. Stash and replay.
    const isSelect = type === 'select';
    const isInput = !isSvg && type === 'input';
    const isTextarea = !isSvg && type === 'textarea';
    const deferValue = isSelect || isInput || isTextarea;
    let hydrated = false;
    if (!fiber.n) {
        hydrated = currentRoot?.h ? adoptHostDom(fiber, fiber.p!) : false;
        if (!hydrated && singleton) {
            fiber.n = singleton;
            queueMutation(() => {
                clearAttributes(singleton);
                applyHostProps(singleton, props, undefined, false, false, false, false);
            });
        }
        else if (!hydrated) {
            fiber.n = createHostNode(type, isSvg);
            applyHostProps(fiber.n as Element, props, undefined, isSvg, isInput, isTextarea, deferValue);
        }
        updateFragmentHost(fiber, true);
        attachRef(fiber, fiber.n);
    }
    else if (prev !== props) {
        queueMutation(() => applyHostProps(fiber.n as Element, props, prev, isSvg, isInput, isTextarea, deferValue));
    }
    if (process.env.NODE_ENV !== 'production') {
        const node = fiber.n!;
        const previous = devToolsMetadata.hosts.get(node);
        onCommitRollback(() => {
            if (previous) devToolsMetadata.hosts.set(node, previous);
            else devToolsMetadata.hosts.delete(node);
        });
        devToolsMetadata.hosts.set(node, fiber);
    }
    if (type === 'form')
        queueMutation(() => bindForm(fiber, handleCommitError));
    if (hadDom)
        syncRefIfChanged(fiber, fiber.n);
    // Children go into this DOM node
    // Textarea's value/defaultValue owns its text node, not child fibers.
    reconcileRaw(fiber, isTextarea ? null : props.children);
    finishHydration(fiber, isTextarea);
    // Apply <select> value after options are mounted.
    if (isSelect && !hydrated)
        queueCommitEffects(() => syncSelectValue(fiber.n as HTMLSelectElement, props, prev));
    fiber.m = props;
    // dy cleared at rerender start; leaving true lets mid-render schedule persist
}
export function renderNode(fiber: Fiber): void {
    fiber.bs = false;
    if (process.env.NODE_ENV !== 'production') {
        if (needsRefreshRemount(fiber))
            fiber = (function (fiber: Fiber): Fiber {
                const parent = fiber.p!;
                const siblings = collectChildren(parent);
                rememberChildList(parent, siblings);
                onCommitRollback(() => {
                    parent.c = siblings[0] ?? null;
                    for (let i = 0; i < siblings.length; i++)
                        siblings[i]!.s = siblings[i + 1] ?? null;
                });
                const next = fiberFromChild({ $$typeof: REACT_ELEMENT_TYPE, type: fiber.type, key: fiber.key, ref: fiber.ref, props: fiber.v }, parent);
                if (fiber.ix !== undefined) next.ix = fiber.ix;
                next.s = fiber.s;
                const previous = siblings[siblings.indexOf(fiber) - 1];
                if (previous)
                    previous.s = next;
                else
                    parent.c = next;
                removeFiber(fiber);
                return next;
            })(fiber);
        fiber.type = resolveRefreshType(fiber.type);
    }
    // Memo consumes pending state when it delegates to its inner renderer.
    if (fiber.t !== FiberTag.Memo)
        fiber.g = false;
    fiber.r ||= currentRoot || findRoot(fiber);
    if (fiber.r?.sp && fiber.p?.ld && fiber.m === null)
        setRetainedFlag(fiber, 'ld', true);
    if (fiber.r?.a)
        CAPABILITIES.p(fiber);
    const fn = RENDERERS[fiber.t];
    try {
        if (process.env.NODE_ENV !== 'production') renderWithDevTools(fiber, fn);
        else if (fn) fn(fiber);
    }
    catch (error) {
        stagedCommits.delete(fiber);
        if (currentRoot?.h && !findErrorBoundary(fiber) || error instanceof RenderErrorCapture || error instanceof RenderSuspenseCapture || isHydrationBailout(error))
            throw error;
        if (isThenable(error)) {
            if (currentRoot?.h)
                throw error;
            handleSuspended(fiber, error);
        }
        else
            handleErrorInRender(fiber, error);
    }
    if (fiber.r?.a)
        CAPABILITIES.s(fiber);
    flushFiberCommits(fiber);
}
// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------
/**
 * Reconcile a parent fiber's child list against new normalized children.
 * Mutates parent.c and the sibling chain.
 * Mounts new host DOM into `domParent` before `anchor` (or appends if anchor === null).
 */
function indexChildren(parent: Fiber, next: Fiber | null): Map<string | number, Fiber> {
    rememberChildList(parent, collectChildren(parent));
    const remaining = new Map<string | number, Fiber>();
    for (; next; next = next.s) remaining.set(next.key ?? next.ix!, next);
    return remaining;
}
export function reconcile(parent: Fiber, newChildren: NormalizedChild[]): void {
    // Keep positional updates allocation-free. Only a structural difference
    // needs the key index and deletion set; both paths share the same writes.
    let next = parent.c;
    let previous: Fiber | null = null;
    let remaining: Map<string | number, Fiber> | undefined;
    const hydrating = !!currentRoot?.h;
    for (let i = 0; i < newChildren.length; i++) {
        const child = newChildren[i];
        if (child == null) continue;
        let match: Fiber | undefined;
        if (!remaining && !hydrating && next && next.ix === i && sameType(next, child)) {
            match = next;
            next = next.s;
        } else {
            if (!remaining) {
                remaining = indexChildren(parent, next);
            }
            const key = isString(child) ? i : child.key ?? i;
            const candidate = remaining.get(key);
            if (candidate && sameType(candidate, child)) {
                match = candidate;
                remaining.delete(key);
            }
        }
        const fiber = match ?? fiberFromChild(child, parent);
        if (match) {
            if (isString(child)) fiber.v = child;
            else {
                if (fiber.type !== child.type) fiber.t = tagForType(child.type);
                fiber.type = child.type;
                fiber.v = child.props;
                if (process.env.NODE_ENV !== 'production') rememberDevToolsFiber(fiber, child);
                fiber.ref = (child as any).ref ?? null;
            }
        }
        fiber.ix = i;
        if (remaining) {
            fiber.p = parent;
            if (previous) previous.s = fiber;
            else parent.c = fiber;
        }
        previous = fiber;
    }
    if (!remaining && !next && !hydrating) {
        renderChildChain(parent);
        return;
    }
    if (!remaining && next) {
        remaining = indexChildren(parent, next);
    }
    if (previous) previous.s = null;
    else parent.c = null;
    // Deletions must commit before replacement document roots are placed.
    for (const fiber of remaining?.values() ?? []) removeFiber(fiber);
    if (hydrating) assignReactIds(parent, newChildren);
    renderChildChain(parent);
}
// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
const pendingEffects: Array<[
    Fiber,
    Effect
]> = [];
const pendingInsertionEffects: Array<[
    Fiber,
    Effect
]> = [];
export type LayoutCommit = [
    Fiber,
    Effect | (() => void),
    boolean
];
const pendingCommits: LayoutCommit[] = [];
const effectQueues: Array<Array<[
    Fiber,
    Effect
] | LayoutCommit>> = [pendingEffects, pendingInsertionEffects, pendingCommits];
let stagedCommits = new Map<Fiber, LayoutCommit[]>();
function renderChildChain(parent: Fiber): void {
    for (let child = parent.c; child; child = child.s)
        renderNode(child);
    while (parent.t !== FiberTag.Host && parent.t !== FiberTag.Root && parent.t !== FiberTag.Portal)
        parent = parent.p!;
    queuePlacement(parent);
}
export function discardPendingEffects(root: FiberRoot): void {
    removeEffects(fiber => findRoot(fiber) === root);
    for (const fiber of stagedCommits.keys()) {
        if (findRoot(fiber) === root)
            stagedCommits.delete(fiber);
    }
}
export function commitPlacements(parents: Iterable<Fiber>): void {
    for (const parent of [...new Set(parents)].sort((a, b) => fiberDepth(b) - fiberDepth(a))) {
        if (parent.u || parent.pd)
            continue;
        const domParent = parent.t === FiberTag.Host ? parent.n! : parent.t === FiberTag.Portal ? parent.v.container : parent.r!.c;
        const doms: Node[] = [];
        for (let child = parent.c; child; child = child.s)
            collectHostDoms(child, doms);
        placeDomsInOrder(doms, domParent);
        const metadata = documentMetadataParent(parent);
        if (metadata && parent.n!.parentNode !== metadata)
            metadata.appendChild(parent.n!);
    }
}
// ---------------------------------------------------------------------------
// Unmount
// ---------------------------------------------------------------------------
export function removeFiber(fiber: Fiber, remove = true): void {
    if (fiber.u)
        return;
    if (currentCommit)
        return queueUnmount(fiber, remove);
    stagedCommits.delete(fiber);
    commitFragmentRef(fiber, 1);
    fiber.u = true;
    if (fiber.t === FiberTag.Suspense && fiber.b?.b) {
        const state = fiber.b;
        state.b._reactRetry = undefined;
        if (remove && state.w) {
            let node: Node | null = state.b;
            while (node) {
                const next: Node | null = node.nextSibling;
                (node as ChildNode).remove();
                if (node === state.e)
                    break;
                node = next;
            }
        }
    }
    if (fiber.t <= FiberTag.Text)
        updateFragmentHost(fiber, false);
    commitFragmentRef(fiber, 2);
    if (fiber.t === FiberTag.Suspense && fiber.b?.f) {
        removeFiber(fiber.b.f, remove);
        fiber.b.f = null;
    }
    // Run cu (fx + layout fx)
    if (fiber.e) {
        const cleanups = fiber.e;
        fiber.e = null;
        for (const cleanup of cleanups) {
            invokeCommit(fiber, cleanup);
        }
    }
    disconnectClass(fiber, true);
    // Detach ref
    if (fiber.cr ?? fiber.ref)
        detachRef(fiber.cr ?? fiber.ref, fiber);
    const singleton = !!fiber.n && fiber.n === documentSingleton(fiber);
    if (singleton && remove)
        clearAttributes(fiber.n as Element);
    let c = fiber.c;
    while (c) {
        const next = c.s;
        removeFiber(c, fiber.t === FiberTag.Portal || (remove && (singleton || fiber.t !== FiberTag.Host)));
        c = next;
    }
    fiber.c = null;
    // Remove DOM if host
    if (!singleton && (remove || documentMetadataParent(fiber)) && (fiber.t <= FiberTag.Text) && fiber.n) {
        fiber.n.parentNode?.removeChild(fiber.n);
    }
}
// Rendering already visits the tree in order. Completing a fiber stages its
// layout work after its children, without another tree walk at commit time.
export function flushFiberCommits(fiber: Fiber): void {
    const entries = stagedCommits.get(fiber);
    if (!entries || layoutIsDisconnected(fiber))
        return;
    stagedCommits.delete(fiber);
    if (placeFragmentCommits(fiber, entries, pendingCommits))
        return;
    // Commit phase, rather than the wrapper's fiber tag, determines order.
    entries.sort((a, b) => +a[2] - +b[2]);
    for (const entry of entries)
        pendingCommits.push(entry);
}
// Wrapper for features that catch thrown thenables inside their render
// functions. Delegates to the installed Suspense capability.
export function handleSuspended(fiber: Fiber, thenable: Promise<any>): void {
    // Hidden work cannot hold a visible transition open. A Suspense boundary
    // inside that Activity still owns its fallback; an outside one does not.
    if (isActivityHidden(fiber) && !findSuspenseBoundary(fiber)) {
        defaultHandleSuspended(fiber, thenable);
        return;
    }
    if (transitionRender)
        throw thenable;
    CAPABILITIES.h(fiber, thenable);
}
export function scheduleUpdate(fiber: Fiber): void {
    // Drop updates scheduled on already-um fibers. Subscribers (router,
    // query, any external store) can fire after unmount if their cleanup was
    // missed, and letting those reach rerenderFiber mounts zombie DOM into the
    // old .p's DOM (which stays reachable via the stale pointer).
    if (fiber.u || fiber.pd)
        return;
    if (process.env.NODE_ENV !== 'production') markDevToolsUpdate(fiber);
    fiber.bt = !!ReactSharedInternals.T && (!fiber.g || !!fiber.bt);
    fiber.g = true;
    // A component finishes its render-phase updates before reconciling children.
    if (ReactSharedInternals.F === fiber)
        return;
    const root = findRoot(fiber);
    if (!root)
        return;
    // Retained Suspense primaries must retry their boundary, not commit a child
    // against the older props preserved by the failed attempt.
    while (fiber.su) {
        fiber = fiber.su;
        fiber.b.u = true;
        fiber.g = true;
    }
    markTransitionUpdate && markTransitionUpdate(root);
    root.p.add(fiber);
    pendingRoots.add(root);
    if (isBatching)
        return;
    if (!root.s) {
        root.s = true;
        if (process.env.NODE_ENV !== 'production' && ReactSharedInternals.A)
            ReactSharedInternals.A.push(flushPending);
        else
            queueMicrotask(flushPending);
    }
}
setCommitCheckpointHook(() => {
    // Restore effect queues and staged layout work at this checkpoint.
    const lengths = effectQueues.map(queue => queue.length);
    const staged = new Map([...stagedCommits].map(([fiber, work]) => [fiber, work.slice()]));
    onCommitRollback(() => {
        effectQueues.forEach((queue, index) => { queue.length = lengths[index]!; });
        stagedCommits = staged;
    });
});
// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const isEventProp = (name: string): boolean => name[0] === 'o' && name[1] === 'n' && name[2]! >= 'A';
function applyHostProps(el: Element, props: any, prev: any, isSvg: boolean, isInput: boolean, isTextarea: boolean, deferValue: boolean): void {
    const mounting = !prev;
    const previousProps = prev || {};
    // Radio groups stay disconnected until type, value and checked agree.
    if (isInput && !mounting)
        setProp(el, 'name', '', undefined, false);
    let events: string[] | undefined;
    for (const key in props) {
        const next = props[key], previous = previousProps[key];
        const changed = mounting || next !== previous;
        if ((!changed && !isInput) || isReservedProp(key) || (deferValue && (key === 'value' || key === 'defaultValue')) || (isInput && (key === 'checked' || key === 'defaultChecked' || key === 'name')))
            continue;
        if (isEventProp(key)) {
            (events ||= []).push(key);
        }
        else if (changed)
            setProp(el, key, next, previous, isSvg);
    }
    for (const key in previousProps) {
        if (isReservedProp(key) || ((isInput || isTextarea) && (key === 'value' || key === 'defaultValue')) || (isInput && (key === 'checked' || key === 'defaultChecked' || key === 'name')))
            continue;
        if (!(key in props))
            setProp(el, key, undefined, previousProps[key], isSvg);
    }
    // Event resolution sees the new input type, as it does on mount.
    if (events)
        for (const key of events)
            setProp(el, key, props[key], previousProps[key], isSvg);
    if (isInput) {
        syncInputValue(el as HTMLInputElement, props, prev);
        setProp(el, 'name', props.name, previousProps.name, false);
    }
    else if (isTextarea)
        syncTextareaValue(el as HTMLTextAreaElement, props, mounting);
}
export function renderFiber(fiber: Fiber, _domParent: Node, _anchor: Node | null): void { renderNode(fiber); }
import { currentCommit, commitSynchronously, queueMutation, queueText, queueCommitEffects, setCommitCheckpointHook, onCommitRollback, onCommitFailure, checkpointCommit, rewindCommit, rememberChildList, queuePlacement, setCommitPlacementHook } from './commit';
import { isFunction, isReservedProp, isThenable } from '../core/functions';
import { renderWithDevTools, rememberDevToolsFiber, markDevToolsUpdate, invokeDevToolsCallback } from './devtools';
import { measureDevToolsLayout, wrapDevToolsLayout, wrapDevToolsPassive } from './devtools-effects';
setCommitPlacementHook(commitPlacements);
export function recoverRootError(error: unknown, abort?: () => void): boolean {
    if (!(error instanceof RenderErrorCapture) || error.b.t !== FiberTag.Root)
        return false;
    const root = error.b.r!;
    abort?.();
    discardPendingWork(root);
    discardPendingEffects(root);
    if (process.env.NODE_ENV !== 'production') runWithOwnerStack(error.o ?? null, () => captureRootError(root, error.s, error.e));
    else captureRootError(root, error.s, error.e);
    return true;
}
// Memo, lazy and ref wrappers render through the same fiber. Always restore
// the wrapper identity, including when the inner render suspends or throws.
export function delegateFiber(fiber: Fiber, type: any, tag = tagForType(type, FiberTag.Fragment)): void {
    const previousType = fiber.type, previousTag = fiber.t;
    fiber.type = type;
    fiber.t = tag;
    try {
        renderNode(fiber);
    }
    finally {
        fiber.type = previousType;
        fiber.t = previousTag;
    }
}
function defaultReadContext(_f: Fiber, ctx: any): any {
    return ctx._currentValue;
}
export function reconcileRaw(fiber: Fiber, children: ReactNode): void { reconcile(fiber, childrenToArray(children)); }

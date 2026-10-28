import { devToolsMetadata, readOwnerStack, runWithOwnerStack } from '../../../core/devtools';
import { drainReplayQueue } from '../../event-replay';
import { attachRootFiber, createFiberRoot } from '../../root-internal';
import { createHostNode, setProp } from '../../dom';
import { attributeName, attributeValue, STRING_BOOLEAN_ATTRS } from '../../../core/attributes';
import { getCurrentRoot, scheduleUpdate, discardPendingWork, discardPendingEffects, isThenable, findRoot, flushSyncWork, renderRoot, scheduleRootRender, recoverRootError, removeFiber } from '../../reconcile';
import { isFunction, isReservedProp } from '../../../core/functions';
import { clearHostContainer, documentMetadataParent, DOCUMENT_HEAD_TAGS, DOCUMENT_SHELL_TAGS } from '../../document-metadata';
import { componentStack } from '../../error-info';
export { reactId, forkId, assignReactIds } from '../../react-ids';
import { FiberTag, type Fiber, type FiberRoot, type ReactNode, } from '../../../core';
import { hydratedFormStates } from '../../../react/form-state';
import { queueBeforeMutation, queueMutation, queueProp, queueText, onCommitRollback } from '../../commit';
import { syncTextareaValue } from '../../form-controls';
// Re-export from event-replay so all hydration concerns live behind one
// feature boundary — the plugin's stub swap strips drainReplayQueue too.
export { drainReplayQueue };
function findNearestSafeHostAboveComposite(fiber: Fiber | null): Fiber | null {
    let host: Fiber | null = null;
    let f = fiber;
    while (f) {
        if (f.t === FiberTag.Host && f.n) {
            if (DOCUMENT_SHELL_TAGS.test(f.type.toLowerCase()))
                return null;
            const parentTag = f.p?.t as number;
            if (!host || (parentTag > FiberTag.Text && parentTag < FiberTag.Suspense)) {
                host = f;
            }
        }
        f = f.p;
    }
    return host;
}
/**
 * Hydration cursor: walks existing DOM children in document order so we can
 * adopt them during fiber tree construction. One cursor per host parent.
 *
 * `endBefore` scopes the cursor to a subrange — used by rehydrateBoundary()
 * so we only adopt DOM up to the closing `/$` marker for that boundary.
 */
export class HydrationCursor {
    n: ChildNode | null;
    p: Node;
    e: ChildNode | null;
    constructor(parent: Node, start: ChildNode | null = null, endBefore: ChildNode | null = null) {
        this.p = parent;
        this.n = start ?? parent.firstChild;
        this.e = endBefore;
    }
    skipClaimedMarkers(): void {
        while (this.n && (CLAIMED.has(this.n) || (this.n.nodeType === 8 && /^\/?&$/.test((this.n as Comment).data))))
            this.n = this.n.nextSibling;
    }
    take(): ChildNode | null {
        while (this.n && this.n !== this.e) {
            const n = this.n;
            // Skip anything that isn't an element (1) or text (3):
            // comments (8), doctype (10), processing instructions (7), cdata (4).
            this.n = n.nextSibling;
            if (!CLAIMED.has(n) && (n.nodeType === 1 || n.nodeType === 3))
                return n;
        }
        return null;
    }
    has(): boolean {
        const position = this.n;
        const found = this.take() !== null;
        this.n = position;
        return found;
    }
}
/**
 * Position-insensitive lookup for head/html adoption. Scans forward past
 * non-matching nodes without removing them, matching by tag AND the key
 * attributes that identify head elements uniquely (rel/href for links,
 * name/property for meta, src for script). Non-matching nodes stay in
 * place so the SSR'd stylesheet/script order is preserved.
 */
function findMetadata(parent: Node | undefined, tag: string, props: Record<string, any>, fallback?: Node): ChildNode | null {
    const keys = HEAD_KEY_ATTRS[tag] ?? [];
    for (const location of [parent, fallback]) {
        if (!location) continue;
        scan: for (const el of (location as Element).children) {
            if (el.localName !== tag || CLAIMED.has(el))
                continue;
            for (const key of keys) {
                const value = props[key];
                if (hydrationAttribute(el, attributeName(key)) !== (value == null ? null : String(value)))
                    continue scan;
            }
            claimHydrationNode(el);
            return el;
        }
    }
    return null;
}
const PROD_HYDRATION_ERROR = 'Hydration mismatch.';
const BOUNDARY_MARKER = /^(\$[?!E~]?)(\d*)$/;
export interface HydrationBailoutError extends Error {
    f: Fiber | null;
}
export const isHydrationBailout = (error: unknown): error is HydrationBailoutError => (!!error && (error as any).f !== undefined);
export function endHydration(root: FiberRoot): void {
    root.h = false;
    root.r.hc = undefined;
}
interface HydrateRootOptions {
    formState?: unknown[] | null;
    identifierStrategy?: 'react';
    identifierPrefix?: string;
    onRecoverableError?: import('../../../core').RecoverableErrorHandler;
    onCaughtError?: import('../../../core').RecoverableErrorHandler;
    onUncaughtError?: import('../../../core').RecoverableErrorHandler;
}
interface HydratedRoot {
    render(children: ReactNode): void;
    unmount(): void;
}
// Complete hydration before layout effects can synchronously update a store.
export function queueHydrationEnd(root: FiberRoot): void {
    if (root.h) queueBeforeMutation(() => endHydration(root));
}
export function beginHydration(root: FiberRoot): void {
    if (process.env.NODE_ENV !== 'production') devToolsMetadata.hydratedRoots.add(root);
    root.ic = 0;
    root.h = true;
    root.r.hc = new HydrationCursor(root.c);
}
// Head elements that we match against server DOM by attribute signature.
const HEAD_KEY_ATTRS: Record<string, ReadonlyArray<string>> = {
    link: ['rel', 'href', 'sizes', 'type'],
    meta: ['name', 'property', 'charSet', 'httpEquiv'],
    script: ['src', 'type'],
    style: ['id', 'media', 'nonce', 'title'],
};
// DOM elements already claimed by some fiber during this hydration pass.
const CLAIMED = new WeakSet<Node>();
function claimHydrationNode(node: Node): void {
    CLAIMED.add(node);
    onCommitRollback(() => CLAIMED.delete(node));
}
const hydrationAttribute = (el: Element, name: string): string | null => (name === 'nonce' && 'nonce' in el && el.hasAttribute(name)
    ? (el as HTMLElement).nonce ?? ''
    : el.getAttribute(name));
function failHydration(fiber: Fiber, error: Error = new Error(PROD_HYDRATION_ERROR), recoverInPlace?: boolean): boolean {
    const root = findRoot(fiber);
    if (root?.re) {
        if (process.env.NODE_ENV !== 'production') runWithOwnerStack(readOwnerStack(fiber), () => root.re!(error, { componentStack: componentStack(fiber) }));
        else root.re(error, { componentStack: componentStack(fiber) });
    }
    if (recoverInPlace)
        return true;
    abortHydration(error, findHostRecoveryParent(fiber) ?? fiber);
}
function onMismatch(fiber: Fiber, actualNode: ChildNode | null): void {
    failHydration(fiber, process.env.NODE_ENV !== 'production'
        ? new Error(`Hydration mismatch: expected <${(fiber.type as string) ?? 'text'}> but found ${actualNode ? (actualNode.nodeType === 1 ? (actualNode as Element).tagName : 'text') : 'nothing'}.`)
        : undefined);
}
/**
 * Inspect the current cursor position for a streaming-suspense boundary
 * marker emitted by the server. Returns info + advances the cursor past the
 * marker pair (start comment + fallback/real content + end comment).
 */
export type BoundaryInfo = [
    0 | 1 | 2 | 3,
    number,
    Comment,
    Comment
];
export function finishHydration(fiber: Fiber, isTextarea: boolean): void {
    const root = fiber.r!;
    if (!root.h || isTextarea || fiber.v?.dangerouslySetInnerHTML != null)
        return;
    const tag = fiber.type.toLowerCase();
    if (!DOCUMENT_SHELL_TAGS.test(tag) && fiber.hc?.has()) {
        const error = new Error(process.env.NODE_ENV !== 'production'
            ? `Hydration mismatch: server rendered extra nodes inside <${tag}>.` : PROD_HYDRATION_ERROR);
        root.re?.(error, { componentStack: null });
        abortHydration(error, fiber);
    }
}
export function adoptTextDom(fiber: Fiber, parent: Fiber, text: string): boolean {
    const cursor = findHostParent(parent).hc;
    if (!cursor)
        return false;
    const candidate = cursor.take();
    if (candidate?.nodeType !== 3) {
        onMismatch(fiber, candidate);
        return false;
    }
    if ((candidate as Text).data !== text) {
        failHydration(fiber, process.env.NODE_ENV !== 'production'
            ? new Error(`Hydration text mismatch: expected "${text}" but found "${(candidate as Text).data}".`)
            : undefined, canRecoverHydrationPropMismatch(candidate));
        queueText(candidate as Text, text);
    }
    fiber.n = candidate;
    return true;
}
export const getHydrationCursor = (hostFiber: Fiber): HydrationCursor | undefined => (hostFiber.hc);
let hydrationProbeDocument: Document | undefined;
function hydrateProps(fiber: Fiber, el: Element, props: Record<string, any>, tag: string, isSvg: boolean): void {
    const recoverInPlace = canRecoverHydrationPropMismatch(el, tag);
    let expected: Element | undefined;
    for (const k in props) {
        const value = props[k];
        if (isReservedProp(k) || k === 'suppressHydrationWarning' || k === 'suppressContentEditableWarning' || isHydrationFormProp(tag, k)) continue;
        const event = isFunction(value) && (k === 'action' || k === 'formAction' || k[0] === 'o' && k[1] === 'n');
        if (event) queueProp(el, k, value, undefined, isSvg);
        if (event || props.suppressHydrationWarning) continue;
        let mismatch: boolean;
        if (k === 'dangerouslySetInnerHTML') {
            let html = value?.__html;
            if (html == null || html === el.innerHTML) continue;
            if (tag !== 'script' && tag !== 'style') {
                // Raw HTML must use the live document's parsing context.
                // Template content treats noscript differently when scripting is enabled.
                const probe = createHostNode(tag, isSvg, el.ownerDocument);
                probe.innerHTML = html;
                html = probe.innerHTML;
            }
            mismatch = (el as HTMLElement).innerHTML !== '' + html;
        } else {
            const attr = attributeName(k, isSvg);
            if (k === 'style' || k === 'value' && value != null && value !== false) {
                expected ??= createHostNode(tag, isSvg, hydrationProbeDocument ??= el.ownerDocument.implementation.createHTMLDocument(''));
                setProp(expected, k, value, undefined, isSvg);
                mismatch = k === 'style'
                    ? !hydrationStylesMatch((el as HTMLElement).style, (expected as HTMLElement).style)
                    : expected.getAttribute(attr) !== hydrationAttribute(el, attr);
            } else {
                const stringified = STRING_BOOLEAN_ATTRS.test(attr) || /^(aria|data)-./.test(k);
                const desired = stringified ? value == null ? null : '' + value
                    : value === false ? null : attributeValue(k, value, attr);
                mismatch = desired !== hydrationAttribute(el, attr);
            }
        }

        if (mismatch) {
            if (recoverInPlace) queueProp(el, k, value, undefined, isSvg);
            failHydration(fiber, process.env.NODE_ENV !== 'production' ? new Error(`Hydration mismatch on <${tag}> for "${k}".`) : undefined, recoverInPlace);
        }
    }
}
/**
 * Try to adopt a DOM node for this host fiber. Returns true if adopted.
 * Attaches existing attrs/children via separate hydrate pass.
 */
export function adoptHostDom(fiber: Fiber, parent: Fiber): boolean {
    const hostParent = findHostParent(parent);
    const cursor = hostParent.hc;
    if (!cursor)
        return false;
    const tag = (fiber.type as string).toLowerCase();
    const props = fiber.v ?? {};
    const documentHeadParent = documentMetadataParent(fiber) || (cursor.p.nodeType === 9 && DOCUMENT_HEAD_TAGS.test(tag)
        ? (cursor.p as Document).head
        : null);
    const parentTag = (cursor.p as Element).localName;
    const isHeadish = parentTag === 'head' || parentTag === 'html' || !!documentHeadParent;
    const metadataParent = documentHeadParent || (isHeadish ? cursor.p
        : cursor.p.nodeType === 9 && tag !== 'html' ? (cursor.p as Document).body : null);
    // Prefer hoisted metadata, then claim its original host position.
    const candidate = metadataParent ? findMetadata(metadataParent, tag, props, documentHeadParent ? cursor.p : undefined) : cursor.take();
    if (!candidate) {
        // Client expected a host here but the cursor is exhausted — server gave
        // fewer children than the client tree. Report the structural gap (React
        // fires `onRecoverableError` for this exact case) and let the reconciler
        // mount a fresh DOM for this fiber below.
        // Exception: <head> children are position-insensitive; a missing match
        // there means "server didn't hoist this one yet", which we silently mount.
        if (!isHeadish)
            onMismatch(fiber, null);
        return false;
    }
    if ((candidate as Element).localName?.toLowerCase() !== tag) {
        // mismatch — log and re-render fresh from this point
        onMismatch(fiber, candidate);
        return false;
    }
    fiber.n = candidate;
    // Apply props (attach events, sync IDL props). Don't re-set existing attrs.
    const isSvg = tag === 'svg' ||
        ((candidate as Element).namespaceURI === 'http://www.w3.org/2000/svg' &&
            tag !== 'foreignobject');
    // Form defaults precede event registration so input type owns event mapping.
    if (tag === 'input' || tag === 'textarea')
        queueHydrationFormState(candidate as Element, props, tag);
    hydrateProps(fiber, candidate as Element, props, tag, isSvg);
    // React SSR adds transport fields for progressively enhanced Server Actions.
    // They have no corresponding client fibers and must not consume child slots.
    if (isFunction(tag === 'form' ? props.action : props.formAction)) {
        for (const child of (candidate as Element).children) {
            if (child.tagName === 'INPUT' && child.getAttribute('type') === 'hidden' && child.getAttribute('name')?.startsWith('$ACTION_'))
                claimHydrationNode(child);
        }
    }
    // Set up child cursor for this host's children
    // Recovery keeps the whole component tree, but mounts fresh children inside
    // the failed host. Hosts outside it still adopt the existing document shell.
    if (fiber.r!.hr !== candidate) {
        fiber.hc = new HydrationCursor(candidate);
    }
    return true;
}
export function findHostParent(fiber: Fiber): Fiber {
    let f: Fiber | null = fiber;
    while (f) {
        // A fiber explicitly holding a cursor acts as a boundary for hydration
        // (e.g. Suspense with a scoped cursor during fallback/boundary hydration).
        if (f.hc || f.t === FiberTag.Host || f.t === FiberTag.Root || f.t === FiberTag.Portal) {
            return f;
        }
        f = f.p;
    }
    if (process.env.NODE_ENV !== 'production') {
        throw new Error('No host parent found');
    }
    throw new Error();
}
export function clearHydrationCursor(hostFiber: Fiber): void {
    hostFiber.hc = undefined;
}
export function abortHydration(cause: unknown, fiber: Fiber | null = null): never {
    throw Object.assign(new Error(PROD_HYDRATION_ERROR, { cause }), { f: fiber });
}
export function setHydrationCursor(hostFiber: Fiber, cursor: HydrationCursor): void {
    hostFiber.hc = cursor;
}
function resetAfterHydrationFailure(root: FiberRoot, container: Element | Document, recoveryContainer: Element | Document = container): void {
    // Retire committed subscriptions and portals without removing the document shell.
    removeFiber(root.r, false);
    discardPendingWork(root);
    discardPendingEffects(root);
    clearHydrationContainer(recoveryContainer);
    attachRootFiber(root, container);
    root.h = false;
}
const canRecoverHydrationPropMismatch = (node: Node, tag?: string): boolean => ((DOCUMENT_SHELL_TAGS.test(tag!) ||
    !!node.ownerDocument?.head?.contains(node)));
function findHostRecoveryParent(fiber: Fiber): Fiber | null {
    if (fiber.t === FiberTag.Text) {
        let directHost = fiber.p;
        while (directHost && (directHost.t !== FiberTag.Host || !directHost.n)) {
            directHost = directHost.p;
        }
        if (!directHost)
            return null;
        let hasEvent;
        const props = directHost.v ?? directHost.m;
        if (props) {
            for (const k in props) {
                if (k[0] === 'o' && k[1] === 'n' && isFunction(props[k])) {
                    hasEvent = true;
                }
            }
        }
        return findNearestSafeHostAboveComposite(hasEvent || directHost.p?.t === FiberTag.Host ? directHost.p : directHost);
    }
    return findNearestSafeHostAboveComposite(fiber.p);
}
export function resumeHydration(fiber: Fiber, root: FiberRoot): (() => void) | undefined {
    if (fiber.b?.p !== true)
        return;
    delete fiber.b.p;
    const previous = root.h;
    root.h = true;
    return () => {
        root.h = previous;
        clearHydrationCursor(fiber);
    };
}
export function tryConsumeBoundary(parent: Fiber): BoundaryInfo | null {
    const cursor = findHostParent(parent).hc;
    if (!cursor)
        return null;
    cursor.skipClaimedMarkers();
    const peek = cursor.n;
    if (!peek || peek.nodeType !== 8)
        return null;
    const data = (peek as Comment).data;
    const m = BOUNDARY_MARKER.exec(data);
    if (!m)
        return null;
    const kind = (m[1] === '$?' || m[1] === '$~') ? 1 : m[1] === '$!' ? 2 : m[1] === '$E' ? 3 : 0;
    const id = Number(m[2]);
    const startMark = peek as Comment;
    // Advance past the start comment
    cursor.n = startMark.nextSibling;
    // Locate end comment: closest <!--/$-->
    let scan = startMark.nextSibling;
    let depth = 0;
    while (scan) {
        if (scan.nodeType === 8) {
            const data = (scan as Comment).data;
            if (BOUNDARY_MARKER.test(data))
                depth++;
            else if (data === '/$' && depth-- === 0)
                return [kind, id, startMark, scan as Comment];
        }
        scan = scan.nextSibling;
    }
    return null;
}
function queueHydrationFormState(el: Element, props: any, tag: string): void {
    queueMutation(() => {
        if (tag === 'input') {
            const input = el as HTMLInputElement;
            if (props.type != null)
                input.type = props.type;
            const value = props.value ?? props.defaultValue;
            if (value != null && (props.value != null || (input.type !== 'submit' && input.type !== 'reset'))) {
                input.defaultValue = '' + value;
            }
            // Mark checked as dirty before changing its default, including clean SSR
            // inputs whose client default differs. This also preserves radio groups.
            input.checked = input.checked;
            input.defaultChecked = !!(props.checked ?? props.defaultChecked);
        }
        else {
            syncTextareaValue(el as HTMLTextAreaElement, props, true);
        }
    });
}
function releaseClaims(container: Element | Document): void {
    for (const node of container.querySelectorAll('*'))
        CLAIMED.delete(node);
}
function clearHydrationContainer(container: Element | Document): void {
    queueMutation(() => clearHostContainer(container));
}
export function advanceCursorPast(parent: Fiber, node: Node): void {
    const cursor = findHostParent(parent).hc;
    if (!cursor)
        return;
    cursor.n = node.nextSibling;
}
const isHydrationFormProp = (tag: string, key: string): boolean => (((/^(input|textarea|select)$/.test(tag) && (key === 'value' || key === 'defaultValue')) ||
    (tag === 'input' && (key === 'checked' || key === 'defaultChecked')) ||
    (tag === 'option' && key === 'selected')));
function hydrationStylesMatch(actual: CSSStyleDeclaration, expected: CSSStyleDeclaration): boolean {
    for (let index = 0; index < expected.length; index++) {
        const property = expected.item(index);
        if (actual.getPropertyValue(property) !== expected.getPropertyValue(property) ||
            actual.getPropertyPriority(property) !== expected.getPropertyPriority(property)) {
            return false;
        }
    }
    return true;
}
export function recoverHydration(root: FiberRoot, error: unknown): boolean {
    if (!isHydrationBailout(error))
        return false;
    const container = root.c as Element | Document;
    const children = root.r.v?.children ?? null;
    const host = error.f;
    const recoveryContainer = host?.t === FiberTag.Host && host.n && findNearestSafeHostAboveComposite(host.p)
        ? host.n as Element : container;
    resetAfterHydrationFailure(root, container, recoveryContainer);
    if (recoveryContainer !== container) {
        releaseClaims(container);
        root.hr = recoveryContainer;
        beginHydration(root);
    }
    try {
        flushSyncWork(() => renderRoot(root, children));
    }
    catch (clientError) {
        resetAfterHydrationFailure(root, container);
        if (recoverRootError(clientError))
            return true;
        throw clientError;
    }
    finally {
        endHydration(root);
        root.hr = undefined;
    }
    return true;
}
const formatHydrationValue = (value: string | null): string => (value == null ? 'nothing' : JSON.stringify(value));
export function deferHydration(_fiber: Fiber, thenable: Promise<any>): boolean {
    // A suspended component does not own a known host range. Its hydration
    // owner, either the root or a marked boundary, must pause and retry it.
    if (getCurrentRoot()?.h) throw thenable;
    return false;
}
export function hydrateRootImpl(container: Element | Document, initialChildren: ReactNode, options: HydrateRootOptions): HydratedRoot {
    const root = createFiberRoot(container, options);
    if (options.formState)
        hydratedFormStates.set(root, {
            value: options.formState[0],
            consume(fiber) {
                const cursor = findHostParent(fiber.p!).hc;
                cursor?.skipClaimedMarkers();
                const marker = cursor?.n;
                if (!marker || marker.nodeType !== 8 || !/^F!?$/.test((marker as Comment).data))
                    throw new Error(process.env.NODE_ENV !== 'production' ? 'Missing server form state marker during hydration.' : '');
                cursor!.n = marker.nextSibling;
                return (marker as Comment).data === 'F!';
            },
        });
    let generation = 0;
    let active = true;
    function hydrate(children: ReactNode): void {
        const attempt = ++generation;
        let hydrationError: unknown = null;
        beginHydration(root);
        try {
            flushSyncWork(() => renderRoot(root, children));
        }
        catch (error) {
            hydrationError = error;
        }
        finally {
            endHydration(root);
        }
        if (isThenable(hydrationError)) {
            discardPendingWork(root);
            discardPendingEffects(root);
            const retry = () => {
                if (!active || attempt !== generation)
                    return;
                // Preparation was rolled back. The next pass must be able to claim
                // metadata and document siblings that the abandoned pass visited.
                releaseClaims(container);
                hydrate(children);
            };
            hydrationError.then(retry, retry);
            return;
        }
        if (hydrationError && !recoverHydration(root, hydrationError))
            throw hydrationError;
        drainReplayQueue();
    }
    hydrate(initialChildren);
    return {
        render(children) {
            generation++;
            if (root.r.m === null) {
                releaseClaims(container);
                hydrate(children);
            }
            else
                scheduleRootRender(root, () => renderRoot(root, children));
        },
        unmount() {
            discardPendingWork(root);
            active = false;
            generation++;
            const pending = root.r.m === null;
            flushSyncWork(() => {
                renderRoot(root, null);
                if (pending)
                    clearHydrationContainer(container);
            });
        },
    };
}

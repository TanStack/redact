import type { ReactElement, ReactNode, Ref } from './types';
export const enum FiberTag {
    Host = 0,
    Text = 1,
    Function = 2,
    Class = 3,
    Fragment = 4,
    Portal = 5,
    Provider = 6,
    Consumer = 7,
    ForwardRef = 8,
    Memo = 9,
    Lazy = 10,
    Suspense = 11,
    Root = 12,
    Activity = 13,
    Resource = 14
}
export interface Hook {
    t?: any[] | undefined;
    s: any;
    q: any;
    d: any;
    c: any;
}
export interface Effect {
    t: 0 | 1 | 2;
    c: () => any;
    d?: () => void;
    s?: boolean | undefined; // Store subscriptions run in layout but stay connected in Suspense.
}
export interface Fiber {
    ix?: number; // Logical child position, including empty slots.
    t: FiberTag; // Tag.
    type: any;
    key: string | null;
    ref: Ref<any> | null;
    v: any; // Pending props.
    m: any; // Committed props.
    b: any; // Renderer state.
    i: any; // Class instance or resource node.
    n: Node | null; // Host node.
    p: Fiber | null; // Parent.
    c: Fiber | null; // First child.
    s: Fiber | null; // Next sibling.
    h: Hook[] | null;
    e: Array<() => void> | null; // Cleanups.
    g: boolean; // Has pending work.
    u: boolean; // Unmounted.
    pd?: boolean;
    su?: Fiber | null; // Retained Suspense primary update target.
    bs?: boolean; // This component suspended without a boundary.
    bt?: boolean; // Pending updates belong only to transitions.
    ld?: boolean; // Layout effects and refs are disconnected, not passive effects.
    r: FiberRoot | null;
    ad?: boolean; // Activity has disconnected this fiber.
    ah?: boolean; // Activity owns its hidden host DOM.
    ef?: Map<Hook, Effect> | undefined; // Retained effect descriptions.
    hc?: import('../dom/features/hydration/full').HydrationCursor | undefined;
    it?: bigint; // React hydration tree ID.
    il?: number; // Local useId calls in this render.
    im?: boolean; // This fiber materialized a React tree ID.
    d?: number; // Cached depth.
    cx?: Map<any, any> | null;
    cr?: Ref<any> | null;
    rc?: (() => void) | null;
}
export type RecoverableErrorHandler = (error: unknown, info: {
    componentStack: string | null;
    errorBoundary?: unknown;
}) => void;
export interface FiberRoot {
    tr?: Set<Fiber> & {
        s: Set<import('../react/action-scope').ActionScope>;
        w?: PromiseLike<unknown>;
        u?: (() => void) | undefined;
    };
    hr?: Node | undefined; // Hydration recovery container.
    ri?: boolean; // React-compatible hydration IDs.
    c: Element | DocumentFragment;
    r: Fiber;
    p: Set<Fiber>;
    s: boolean;
    u?: (() => void) | undefined;
    er?: Array<{
        error: unknown;
        stack: string;
        ownerStack?: string | null;
    }> | undefined;
    eb?: boolean;
    sp?: boolean;
    re?: RecoverableErrorHandler | undefined;
    ce?: RecoverableErrorHandler | undefined;
    ue?: RecoverableErrorHandler | undefined;
    i: string | undefined;
    ic: number;
    h: boolean;
    a?: boolean;
    fr?: boolean;
}
export function createFiber(tag: FiberTag, type: any, key: string | null): Fiber {
    return {
        t: tag,
        type,
        key,
        ref: null,
        v: null,
        m: null,
        b: null,
        i: null,
        n: null,
        p: null,
        c: null,
        s: null,
        h: null,
        e: null,
        g: false,
        u: false,
        r: null,
    };
}
export type ChildNode = ReactElement | string | number | boolean | null | undefined | ChildNode[];
export type { ReactElement, ReactNode };

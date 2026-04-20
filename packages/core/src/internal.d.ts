import type { ReactElement, ReactNode, Ref } from './types';
export declare const enum FiberTag {
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
    Root = 12
}
export declare const enum FiberFlag {
    None = 0,
    Placement = 1,
    Update = 2,
    Deletion = 4,
    Ref = 8,
    Effect = 16,
    LayoutEffect = 32,
    ContentReset = 64,
    DidCapture = 128
}
export interface Hook {
    state: any;
    queue: any;
    deps: any;
    cleanup: any;
    next: Hook | null;
}
export interface Effect {
    tag: 'effect' | 'layout' | 'insertion';
    create: () => any;
    destroy: (() => void) | void;
    deps: ReadonlyArray<unknown> | undefined;
}
export interface Fiber {
    tag: FiberTag;
    type: any;
    key: string | null;
    ref: Ref<any> | null;
    pendingProps: any;
    memoizedProps: any;
    memoizedState: any;
    stateNode: any;
    dom: Node | null;
    parent: Fiber | null;
    child: Fiber | null;
    sibling: Fiber | null;
    hooks: Hook | null;
    effects: Effect[] | null;
    layoutEffects: Effect[] | null;
    cleanups: Array<() => void> | null;
    flags: FiberFlag;
    dirty: boolean;
    unmounted: boolean;
    root: FiberRoot | null;
}
export interface FiberRoot {
    container: Element | DocumentFragment;
    current: Fiber;
    pending: Set<Fiber>;
    scheduled: boolean;
    onRecoverableError?: (err: unknown) => void;
    onCaughtError?: (err: unknown) => void;
    onUncaughtError?: (err: unknown) => void;
    identifierPrefix: string;
    hydrating: boolean;
}
export declare function createFiber(tag: FiberTag, type: any, key: string | null): Fiber;
export type ChildNode = ReactElement | string | number | boolean | null | undefined | ChildNode[];
export type { ReactElement, ReactNode };

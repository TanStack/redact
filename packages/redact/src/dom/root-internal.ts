import { FiberTag, createFiber, type Fiber, type FiberRoot, type RecoverableErrorHandler } from '../core';
export interface RootOptionsInternal {
    identifierStrategy?: 'react';
    identifierPrefix?: string;
    onRecoverableError?: RecoverableErrorHandler;
    onCaughtError?: RecoverableErrorHandler;
    onUncaughtError?: RecoverableErrorHandler;
}
export function createFiberRoot(container: Element | Document | DocumentFragment, options: RootOptionsInternal): FiberRoot {
    const root = {
        p: new Set(),
        s: false,
        re: options.onRecoverableError,
        ce: options.onCaughtError,
        ue: options.onUncaughtError,
        i: options.identifierPrefix,
        h: false,
    } as FiberRoot;
    root.ri = true;
    attachRootFiber(root, container);
    return root;
}
export function attachRootFiber(root: FiberRoot, container: Element | Document | DocumentFragment): void {
    const rootFiber = createFiber(FiberTag.Root, null, null);
    root.c = container as any;
    root.ic = 0;
    rootFiber.r = root;
    rootFiber.i = container;
    root.r = rootFiber;
}
export function getRootContainer(fiber: Fiber, fallback: Node = fiber.r!.c): Node {
    for (let parent = fiber.p; parent; parent = parent.p) {
        if (parent.t === FiberTag.Portal)
            return parent.v.container;
    }
    return fiber.r?.c || fallback;
}

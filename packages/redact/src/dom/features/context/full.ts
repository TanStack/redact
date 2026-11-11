import { visitChildren } from '../../reconcile';
import { isFunction } from '../../../core/functions';
import { FiberTag, type Fiber } from '../../../core';
import { REACT_CONTEXT_TYPE, REACT_PROVIDER_TYPE, REACT_CONSUMER_TYPE } from '../../../react';
import { installRenderer, registerTypeMatcher, installCapability, reconcileRaw, childrenToArray, renderNode, getHostParent, } from '../../reconcile';
let changingProviders = 0;
function contextValue(fiber: Fiber, ctx: any): any {
    let p: Fiber | null = fiber.p;
    while (p) {
        if (p.t === FiberTag.Provider && (p.type as any)._context === ctx) {
            return p.v?.value;
        }
        p = p.p;
    }
    return ctx._currentValue;
}
function remember(fiber: Fiber, ctx: any, value: any): void {
    ;
    (fiber.cx ??= new Map()).set(ctx, value);
}
function realReadContext(fiber: Fiber, ctx: any): any {
    const value = contextValue(fiber, ctx);
    remember(fiber, ctx, value);
    // Initial suspended attempts are discarded. Keep their external context
    // reads on the boundary so a provider can retry them before a promise settles.
    let child = fiber;
    let p = fiber.p;
    while (p) {
        if (p.t === FiberTag.Provider && p.type._context === ctx)
            break;
        if (p.t === FiberTag.Suspense && p.b?.f !== child)
            remember(p, ctx, value);
        child = p;
        p = p.p;
    }
    return value;
}
export function ownContextChanged(fiber: Fiber): boolean {
    if (!changingProviders)
        return false;
    const reads = fiber.cx;
    if (reads) {
        for (const [ctx, value] of reads) {
            if (!Object.is(value, contextValue(fiber, ctx)))
                return true;
        }
    }
    return false;
}
export function hasContextChanged(fiber: Fiber, includeFallback = true): boolean {
    if (!changingProviders)
        return false;
    return ownContextChanged(fiber) || !!visitChildren(fiber, hasContextChanged, undefined, !includeFallback);
}
export { renderPendingChildren as renderContextConsumers } from '../../reconcile';

function renderProvider(fiber: Fiber): void {
    const props = fiber.v ?? {};
    const changed = fiber.m && !Object.is(fiber.m.value, props.value);
    if (changed)
        changingProviders++;
    try {
        reconcileRaw(fiber, props.children);
    }
    finally {
        if (changed)
            changingProviders--;
    }
    fiber.m = props;
}
function renderConsumer(fiber: Fiber): void {
    fiber.cx?.clear();
    const props = fiber.v ?? {};
    const children = props.children;
    const value = realReadContext(fiber, (fiber.type as any)._context);
    const rendered = isFunction(children) ? children(value) : null;
    reconcileRaw(fiber, rendered);
    fiber.m = props;
}
registerTypeMatcher((_type, marker) => marker === REACT_CONTEXT_TYPE || marker === REACT_PROVIDER_TYPE
    ? FiberTag.Provider
    : marker === REACT_CONSUMER_TYPE
        ? FiberTag.Consumer
        : null);
installRenderer(FiberTag.Provider, renderProvider);
installRenderer(FiberTag.Consumer, renderConsumer);
installCapability('c', realReadContext);

installCapability('o', fiber => fiber.t === FiberTag.Suspense ? hasContextChanged(fiber) : ownContextChanged(fiber));

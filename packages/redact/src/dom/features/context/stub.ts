import { isFunction } from '../../../core/functions';
import { FiberTag, type Fiber } from '../../../core';
import { REACT_CONTEXT_TYPE, REACT_PROVIDER_TYPE, REACT_CONSUMER_TYPE } from '../../../react';
import { installRenderer, registerTypeMatcher, reconcileRaw } from '../../reconcile';
export const hasContextChanged: (_f: Fiber, _includeFallback?: boolean) => boolean = () => false;
export const ownContextChanged = hasContextChanged;
export function renderContextConsumers(_f: Fiber): void { }
// Stub: Context feature disabled. Provider elements render as Fragments
// (value is never propagated — descendants see only the Context's default).
// Consumer elements still invoke their function-children with the default
// value, so `<Ctx.Consumer>{v => ...}</Ctx.Consumer>` patterns keep working.
// The default `readContext` capability returns `ctx._currentValue` without
// walking, which matches the no-Provider-fibers-in-tree reality.
function renderConsumerStub(fiber: Fiber): void {
    const props = fiber.v ?? {};
    reconcileRaw(fiber, isFunction(props.children) &&
        props.children((fiber.type as any)._context._currentValue));
    fiber.m = props;
}
registerTypeMatcher((_type, marker) => marker === REACT_CONTEXT_TYPE || marker === REACT_PROVIDER_TYPE
    ? FiberTag.Fragment
    : marker === REACT_CONSUMER_TYPE
        ? FiberTag.Consumer
        : null);
installRenderer(FiberTag.Consumer, renderConsumerStub);

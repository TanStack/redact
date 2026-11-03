import { FiberTag, type Fiber } from '../../../core';
import { REACT_LAZY_TYPE } from '../../../react';
import { installRenderer, registerTypeMatcher, delegateFiber, isThenable, handleSuspended, deferHydration, } from '../../reconcile';
import { resolveRefreshType } from '../../refresh';
function renderLazy(fiber: Fiber): void {
    const { _payload, _init } = fiber.type as any;
    let resolved: any;
    try {
        resolved = _init(_payload);
        if (process.env.NODE_ENV !== 'production')
            resolved = resolveRefreshType(resolved);
    }
    catch (thenable: any) {
        if (isThenable(thenable)) {
            if (deferHydration(fiber, thenable))
                return;
            handleSuspended(fiber, thenable);
            // reconcile would be called here if we were rendering children,
            // but Lazy delegates and has no children of its own.
            return;
        }
        throw thenable;
    }
    delegateFiber(fiber, resolved);
}
registerTypeMatcher((_type, marker) => (marker === REACT_LAZY_TYPE ? FiberTag.Lazy : null));
installRenderer(FiberTag.Lazy, renderLazy);

import { resolveClassProps } from '../../../core/class-props';
import { isFunction } from '../../../core/functions';
import { FiberTag, type Fiber, type ReactNode } from '../../../core';
import { installRenderer, reconcileRaw, childrenToArray, scheduleUpdate, isThenable, handleSuspended, deferHydration, handleErrorInRender, } from '../../reconcile';
// Stub: Class feature disabled. Class components still render — they're
// detected by `type.prototype.isReactComponent` in the reconciler regardless —
// but ONLY the core contract is honored: constructor, `render()`, and
// `setState` triggering a re-render. Dropped from this stub:
//   - `contextType` (this.context is always undefined)
//   - `getDerivedStateFromProps`
//   - `shouldComponentUpdate`
//   - `componentDidMount` / `componentDidUpdate` / `componentWillUnmount`
//   - `getDerivedStateFromError` / `componentDidCatch` (error boundaries)
// Apps that actually need these should keep the feature on. Apps that just
// have a handful of legacy class components that do `render() + setState`
// still work, and save ~400 B min / ~200 B gz.
function renderClassStub(fiber: Fiber): void {
    const Ctor = fiber.type as any;
    let instance = fiber.i;
    const props = resolveClassProps(Ctor, fiber.v ?? {});
    if (!instance) {
        instance = new Ctor(props, undefined);
        instance.props = props;
        instance._f = fiber;
        instance._q = (updater: any, cb?: () => void) => {
            const next = isFunction(updater) ? updater(instance.state, instance.props) : updater;
            if (next != null)
                instance.state = { ...instance.state, ...next };
            if (cb)
                (fiber.e ||= []).push(cb);
            scheduleUpdate(fiber);
        };
        instance._u = instance._q;
        fiber.i = instance;
    }
    else {
        instance.props = props;
    }
    let rendered: ReactNode;
    try {
        rendered = instance.render();
    }
    catch (e: any) {
        if (isThenable(e)) {
            if (deferHydration(fiber, e)) return;
            handleSuspended(fiber, e);
            rendered = null;
        }
        else {
            handleErrorInRender(fiber, e);
            return;
        }
    }
    reconcileRaw(fiber, rendered);
    fiber.m = props;
}
installRenderer(FiberTag.Class, renderClassStub);
export const findDOMNode = null;

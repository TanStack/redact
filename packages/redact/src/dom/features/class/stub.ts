import { FiberTag, type Fiber, type ReactNode } from '../../../core'
import {
  registerRenderer,
  reconcileChildren,
  childrenToArray,
  scheduleUpdate,
  isThenable,
  handleSuspended,
  handleErrorInRender,
} from '../../reconcile'

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
function renderClassStub(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const Ctor = fiber.type as any
  let instance = fiber.stateNode
  const props = fiber.pendingProps ?? {}

  if (!instance) {
    instance = new Ctor(props, undefined)
    instance.props = props
    instance._fiber = fiber
    instance._enqueueUpdate = (updater: any, cb?: () => void) => {
      const next = typeof updater === 'function' ? updater(instance.state, instance.props) : updater
      if (next != null) instance.state = { ...instance.state, ...next }
      if (cb) {
        fiber.cleanups ||= []
        fiber.cleanups.push(cb)
      }
      scheduleUpdate(fiber)
    }
    instance._forceUpdate = instance._enqueueUpdate
    fiber.stateNode = instance
  } else {
    instance.props = props
  }

  let rendered: ReactNode
  try {
    rendered = instance.render()
  } catch (e: any) {
    if (isThenable(e)) {
      handleSuspended(fiber, e)
      rendered = null
    } else {
      handleErrorInRender(fiber, e)
      return
    }
  }

  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.memoizedProps = props
}

registerRenderer(FiberTag.Class, renderClassStub)

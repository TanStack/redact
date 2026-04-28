import { FiberTag, type Fiber, type ReactNode } from '../../../core'
import {
  registerRenderer,
  reconcileChildren,
  childrenToArray,
  scheduleUpdate,
  scheduleLifecycle,
  isThenable,
  handleSuspended,
  handleErrorInRender,
} from '../../reconcile'

function renderClass(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const Ctor = fiber.type as any
  let instance = fiber.stateNode
  const props = fiber.pendingProps ?? {}
  const isNew = !instance

  // Class contextType: read the current value of the subscribed context so
  // `this.context` reflects the nearest Provider. Evaluated every render.
  const ctxValue = Ctor.contextType ? Ctor.contextType._currentValue : undefined

  if (isNew) {
    instance = new Ctor(props, ctxValue)
    instance.props = props
    instance.context = ctxValue
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
    instance._forceUpdate = (cb?: () => void) => {
      if (cb) {
        fiber.cleanups ||= []
        fiber.cleanups.push(cb)
      }
      scheduleUpdate(fiber)
    }
    fiber.stateNode = instance
    if (Ctor.getDerivedStateFromProps) {
      const d = Ctor.getDerivedStateFromProps(props, instance.state)
      if (d) instance.state = { ...instance.state, ...d }
    }
  } else {
    const prevProps = instance.props
    const prevState = instance.state
    // Refresh context on every render — Providers higher up may have changed.
    instance.context = ctxValue
    if (Ctor.getDerivedStateFromProps) {
      const d = Ctor.getDerivedStateFromProps(props, instance.state)
      if (d) instance.state = { ...instance.state, ...d }
    }
    if (instance.shouldComponentUpdate) {
      if (!instance.shouldComponentUpdate(props, instance.state, instance.context)) {
        instance.props = props
        fiber.memoizedProps = props
        // Still need to render children with previous output
        if (fiber.memoizedState?.rendered) {
          reconcileChildren(fiber, childrenToArray(fiber.memoizedState.rendered), domParent, anchor)
        }
        return
      }
    }
    instance.props = props
    // New snapshot must win over any stale one from a previous render —
    // otherwise componentDidUpdate keeps seeing the original props and can
    // ping-pong setState forever.
    fiber.memoizedState = { ...(fiber.memoizedState ?? {}), prevProps, prevState }
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
  fiber.memoizedState = { ...(fiber.memoizedState ?? {}), rendered }

  reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  fiber.memoizedProps = props

  // Schedule lifecycle
  if (isNew) {
    if (instance.componentDidMount) {
      scheduleLifecycle(fiber, () => instance.componentDidMount())
    }
  } else if (instance.componentDidUpdate) {
    const { prevProps, prevState } = fiber.memoizedState ?? {}
    scheduleLifecycle(fiber, () => instance.componentDidUpdate(prevProps, prevState))
  }
}

registerRenderer(FiberTag.Class, renderClass)

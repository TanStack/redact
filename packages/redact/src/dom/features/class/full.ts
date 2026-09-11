import { FiberTag, type Fiber, type ReactNode } from '../../../core'
import { checkpointCommit, rewindCommit, queueBeforeMutation, queueMutation } from '../../commit'
import {
  registerRenderer,
  reconcileChildren,
  childrenToArray,
  scheduleUpdate,
  scheduleLifecycle,
  isThenable,
  handleSuspended,
  handleErrorInRender,
  readContext,
  attachRef,
  syncRefIfChanged,
  isActivityHidden,
  layoutIsDisconnected,
  RenderErrorCapture,
  handleCommitError,
} from '../../reconcile'

function renderClass(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  fiber.cx?.clear()
  const Ctor = fiber.type as any
  let instance = fiber.sn
  const props = fiber.pp ?? {}
  const isNew = !instance
  const previous = fiber.ms?.c
  let didRender = true
  let captured = fiber.ms?.error instanceof RenderErrorCapture ? fiber.ms.error as RenderErrorCapture : undefined
  if (captured) delete fiber.ms.error

  // Class contextType: read the current value of the subscribed context so
  // `this.context` reflects the nearest Provider. Evaluated every render.
  const ctxValue = Ctor.contextType ? readContext(fiber, Ctor.contextType) : undefined
  const contextChanged = instance && !Object.is(instance.context, ctxValue)

  if (isNew) {
    instance = new Ctor(props, ctxValue)
    instance.props = props
    instance.context = ctxValue
    instance._fiber = fiber
    instance._enqueueUpdate = (updater: any, cb?: () => void) => {
      const next = typeof updater == 'function' ? updater(instance.state, instance.props) : updater
      if (next != null) instance.state = { ...instance.state, ...next }
      if (cb) {
        fiber.cu ||= []
        fiber.cu.push(cb)
      }
      scheduleUpdate(fiber)
    }
    instance._forceUpdate = (cb?: () => void) => {
      if (cb) {
        fiber.cu ||= []
        fiber.cu.push(cb)
      }
      scheduleUpdate(fiber)
    }
    fiber.sn = instance
    if (Ctor.getDerivedStateFromProps) {
      const d = Ctor.getDerivedStateFromProps(props, instance.state)
      if (d) instance.state = { ...instance.state, ...d }
    }
  } else {
    // Refresh context on every render — Providers higher up may have changed.
    instance.context = ctxValue
    if (Ctor.getDerivedStateFromProps) {
      const d = Ctor.getDerivedStateFromProps(props, instance.state)
      if (d) instance.state = { ...instance.state, ...d }
    }
    if (!captured && instance.shouldComponentUpdate && !contextChanged) {
      if (!instance.shouldComponentUpdate(props, instance.state, instance.context)) {
        didRender = false
      }
    }
    instance.props = props
  }
  if (captured && Ctor.getDerivedStateFromError) {
    const update = Ctor.getDerivedStateFromError(captured.error)
    if (update != null) instance.state = { ...instance.state, ...update }
  }

  let rendered: ReactNode
  try {
    rendered = captured && !Ctor.getDerivedStateFromError ? null : didRender ? instance.render() : fiber.ms?.r
  } catch (e: any) {
    if (isThenable(e)) {
      handleSuspended(fiber, e)
      return
    } else {
      handleErrorInRender(fiber, e)
      return
    }
  }
  fiber.ms = { ...(fiber.ms ?? {}), r: rendered }

  const canCatch = Ctor.getDerivedStateFromError || instance.componentDidCatch
  if (canCatch) fiber.ms.b = Ctor
  if (canCatch && fiber.root) fiber.root.eb = true
  const checkpoint = canCatch ? checkpointCommit(fiber) : -1
  try {
    reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  } catch (error) {
    if (!(error instanceof RenderErrorCapture) || error.boundary !== fiber) throw error
    rewindCommit(checkpoint)
    captured = error
    didRender = true
    if (Ctor.getDerivedStateFromError) {
      const update = Ctor.getDerivedStateFromError(error.error)
      if (update != null) instance.state = { ...instance.state, ...update }
      try { rendered = instance.render() } catch (fallbackError) {
        handleErrorInRender(fiber, fallbackError)
        return
      }
    } else rendered = null
    fiber.ms = { ...(fiber.ms ?? {}), r: rendered }
    reconcileChildren(fiber, childrenToArray(rendered), domParent, anchor)
  }
  fiber.mp = props
  const state = instance.state
  queueMutation(() => { fiber.ms.c = { props, state } })

  if (isNew) attachRef(fiber, instance)
  else syncRefIfChanged(fiber, instance)

  // Schedule lifecycle
  if (isNew) {
    if (instance.componentDidMount) {
      scheduleLifecycle(fiber, () => instance.componentDidMount())
    }
  } else if (previous && didRender) {
    let snapshot: any
    if (instance.getSnapshotBeforeUpdate && !layoutIsDisconnected(fiber)) {
      queueBeforeMutation(() => {
        if (!fiber.um && !fiber.pd && !isActivityHidden(fiber) && !layoutIsDisconnected(fiber)) {
          try { snapshot = instance.getSnapshotBeforeUpdate(previous.props, previous.state) }
          catch (error) { handleCommitError(fiber, error) }
        }
      })
    }
    if (instance.componentDidUpdate) {
      scheduleLifecycle(fiber, () => instance.componentDidUpdate(previous.props, previous.state, snapshot))
    }
  }
  if (captured) {
    const error = captured.error
    const info = { componentStack: captured.stack }
    scheduleLifecycle(fiber, () => {
      try { fiber.root?.ce?.(error, { ...info, errorBoundary: instance }) }
      catch (callbackError) { setTimeout(() => { throw callbackError }) }
      instance.componentDidCatch?.(error, info)
    })
  }
}

registerRenderer(FiberTag.Class, renderClass)

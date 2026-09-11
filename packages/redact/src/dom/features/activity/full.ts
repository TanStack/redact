import { FiberTag, type Fiber } from '../../../core'
import { REACT_ACTIVITY_TYPE } from '../../../react/activity'
import { onCommitRollback, queueMutation } from '../../commit'
import { retainedEffects as effects, inSuspensePrimary, setLayoutDisconnected, walkRetained as walk } from '../../retained-effects'
import {
  attachRef,
  childrenToArray,
  detachRef,
  enqueueEffect,
  findRoot,
  flushFiberCommits,
  getCurrentRoot,
  handleCommitError,
  installCapability,
  reconcileChildren,
  registerRenderer,
  registerTypeMatcher,
  scheduleLifecycle,
  scheduleUpdate,
} from '../../reconcile'

// Retain effect descriptions, not subscriptions, while a subtree is hidden.
// Weak keys keep this bookkeeping out of fibers that do not use Activity.
const disconnected = new WeakSet<Fiber>()
const hiddenDoms = new WeakSet<Fiber>()

function setMembership(set: WeakSet<Fiber>, fiber: Fiber, present: boolean): boolean {
  const previous = set.has(fiber)
  if (previous === present) return previous
  onCommitRollback(() => { if (previous) set.add(fiber); else set.delete(fiber) })
  if (present) set.add(fiber)
  else set.delete(fiber)
  return previous
}

function isHidden(fiber: Fiber): boolean {
  if (!(fiber.root ?? findRoot(fiber))?.a) return false
  for (let parent: Fiber | null = fiber; parent; parent = parent.parent) {
    if (parent.tag === FiberTag.Activity && parent.pp?.mode === 'hidden') return true
  }
  return false
}

function report(fiber: Fiber, fn: () => void): void {
  try { fn() } catch (error) { handleCommitError(fiber, error) }
}

function disconnect(fiber: Fiber): void {
  if (disconnected.has(fiber)) return
  setMembership(disconnected, fiber, true)
  queueMutation(() => {
    // Insertion effects remain connected, just as they do in React.
    const insertion = new Set<() => void>()
    for (const [hook, effect] of effects.get(fiber) ?? []) {
      if (effect.t === 2 && hook.c) insertion.add(hook.c)
    }
    if (fiber.cu) {
      const keep = fiber.cu.filter(cleanup => insertion.has(cleanup))
      for (const cleanup of fiber.cu) {
        if (!insertion.has(cleanup)) report(fiber, cleanup)
      }
      fiber.cu = keep.length ? keep : null
    }
    for (const [hook, effect] of effects.get(fiber) ?? []) {
      if (effect.t !== 2) hook.c = null
    }
    detachRef(fiber.cr ?? fiber.ref)
    fiber.cr = null
    fiber.rc = null
    const instance = fiber.sn?._fiber === fiber ? fiber.sn : null
    if (!fiber.ld && instance?.componentWillUnmount) {
      const props = instance.props, state = instance.state, committed = fiber.ms?.c
      if (committed) { instance.props = committed.props; instance.state = committed.state }
      try { report(fiber, () => instance.componentWillUnmount()) }
      finally { instance.props = props; instance.state = state }
    }
  })
}

function prepare(fiber: Fiber): void {
  if (!isHidden(fiber) || disconnected.has(fiber)) return
  if (fiber.mp == null) setMembership(disconnected, fiber, true)
  else disconnect(fiber)
}

function needsHiddenDom(fiber: Fiber): boolean {
  for (let parent = fiber.parent; parent; parent = parent.parent) {
    if (parent.tag === FiberTag.Activity && parent.pp?.mode === 'hidden') return true
    if (parent.tag === FiberTag.Host) return false
    // A portal starts a new DOM tree, but keeps the parent's Activity state.
    if (parent.tag === FiberTag.Portal) return isHidden(parent)
  }
  return false
}

function syncDom(fiber: Fiber): void {
  if (!(fiber.root ?? findRoot(fiber))?.a) return
  if (!fiber.dom || (fiber.tag !== FiberTag.Host && fiber.tag !== FiberTag.Text)) return
  if (needsHiddenDom(fiber)) {
    setMembership(hiddenDoms, fiber, true)
    queueMutation(() => {
      if (fiber.tag === FiberTag.Text) fiber.dom!.nodeValue = ''
      else (fiber.dom as HTMLElement).style.setProperty('display', 'none', 'important')
    })
  } else if (setMembership(hiddenDoms, fiber, false)) {
    // A Suspense fallback can remain active after its Activity is revealed.
    // Its preserved primary DOM must stay hidden until that boundary resumes.
    for (let parent = fiber.parent; parent; parent = parent.parent) {
      if (parent.tag === FiberTag.Suspense && parent.ms?.d?.some(([node]: [Node, string]) => node === fiber.dom)) return
    }
    const props = fiber.pp
    queueMutation(() => {
      if (fiber.tag === FiberTag.Text) fiber.dom!.nodeValue = props
      else {
        const display = props?.style?.display
        ;(fiber.dom as HTMLElement).style.display = display == null || typeof display === 'boolean' ? '' : ('' + display).trim()
      }
    })
  }
}

function reconnect(fiber: Fiber): void {
  syncDom(fiber)
  if (isHidden(fiber) || inSuspensePrimary(fiber) || !setMembership(disconnected, fiber, false)) return
  setLayoutDisconnected(fiber, false)
  const instance = fiber.sn?._fiber === fiber ? fiber.sn : null
  if (fiber.tag === FiberTag.Host || fiber.tag === FiberTag.Resource) attachRef(fiber, fiber.dom)
  else if (instance || fiber.tag === FiberTag.Fragment) attachRef(fiber, fiber.sn)
  for (const effect of effects.get(fiber)?.values() ?? []) {
    if (effect.t !== 2) enqueueEffect(fiber, effect)
  }
  if (instance?.componentDidMount) {
    scheduleLifecycle(fiber, () => instance.componentDidMount())
  }
  flushFiberCommits(fiber)
}

function finish(fiber: Fiber): void {
  if (fiber.tag === FiberTag.Suspense && (fiber.root ?? findRoot(fiber))?.a) walk(fiber, reconnect, true)
  else syncDom(fiber)
}

function renderActivity(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const root = fiber.root ?? findRoot(fiber)
  if (root) root.a = true
  const props = fiber.pp ?? {}
  // Hidden content is absent from server HTML. Mount it after hydration so it
  // cannot consume a following visible sibling's hydration cursor.
  if (getCurrentRoot()?.h && props.mode === 'hidden' && !fiber.mp) {
    fiber.mp = props
    queueMicrotask(() => scheduleUpdate(fiber))
    return
  }
  if (isHidden(fiber)) walk(fiber, prepare)
  else walk(fiber, syncDom)
  reconcileChildren(fiber, childrenToArray(props.children), domParent, anchor)
  walk(fiber, reconnect, true)
  fiber.mp = props
}

installCapability('isActivityHidden', isHidden)
installCapability('activityIsDisconnected', fiber => disconnected.has(fiber))
installCapability('prepareActivityFiber', prepare)
installCapability('syncActivity', finish)
registerTypeMatcher(type => type === REACT_ACTIVITY_TYPE ? FiberTag.Activity : null)
registerRenderer(FiberTag.Activity, renderActivity)

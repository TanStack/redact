import { FiberTag, type Fiber, type Hook } from '../core'
import { setProp } from './dom'

export interface CommitPlan {
  q: any[][] // Before-mutation, mutation, effect, rollback and failure queues.
  c: number[][] // Queue lengths saved at each rollback checkpoint.
  b: number // Next before-mutation callback, including reentrant commits.
  m: boolean // Mutation phase has started, preventing duplicate commits.
}

export let currentCommit: CommitPlan | null = null
let activeCommit: CommitPlan | null = null
let reusableCommit: CommitPlan | undefined
let checkpointHook: (() => void) | undefined

function createCommit(): CommitPlan {
  return { q: [[], [], [], [], []], c: [], b: 0, m: false }
}

export function prepareCommit(render: () => void, plan = createCommit()): CommitPlan {
  const previous = currentCommit
  currentCommit = plan
  try { render() } catch (error) {
    currentCommit = null
    const failed = plan.q[4]!
    for (let i = 0; i < failed.length; i++) {
      const work = failed[i]
      if (typeof work === 'function') work()
      else {
        const children = failed[++i] as Fiber[] | undefined
        work.child = children?.[0] ?? null
        if (children) for (let j = 0; j < children.length; j++) children[j]!.sibling = children[j + 1] ?? null
      }
    }
    throw error
  } finally { currentCommit = previous }
  return plan
}

export function queueMutation(work: () => void): void {
  if (!currentCommit) { work(); return }
  currentCommit.q[1]!.push(work)
}

export function queueText(node: Text, value: string): void {
  if (currentCommit) currentCommit.q[1]!.push(value, node)
  else node.data = value
}

export function queueProp(node: Element, key: string, value: any, previous: any, svg: boolean): void {
  if (currentCommit) currentCommit.q[1]!.push(node, key, value, previous, svg)
  else setProp(node, key, value, previous, svg)
}

export function queueBeforeMutation(work: () => void): void {
  if (currentCommit) currentCommit.q[0]!.push(work)
  else work()
}

export function queueCommitEffects(work: () => void): void {
  const plan = currentCommit || activeCommit
  if (plan) plan.q[2]!.push(work)
  else work()
}

export function onCommitRollback(work: () => void): void {
  currentCommit?.q[3]!.push(work)
}

export function onCommitFailure(work: () => void): void {
  if (currentCommit) currentCommit.q[4]!.push(work)
  else work()
}

// Structural reconciliation already builds the previous child list. Keep
// that list for a failed preparation without allocating per-fiber closures.
export function rememberChildList(parent: Fiber, children?: Fiber[]): void {
  currentCommit?.q[4]!.push(parent, children)
}

export function setCommitCheckpointHook(hook: () => void): void {
  checkpointHook = hook
}

export function checkpointCommit(fiber?: Fiber): number {
  if (!currentCommit) return -1
  const checkpoint = currentCommit.c.length
  currentCommit.c.push(currentCommit.q.map(queue => queue.length))
  if (fiber) rememberSubtree(fiber)
  checkpointHook?.()
  return checkpoint
}

function rememberSubtree(fiber: Fiber): void {
  const saved = { ...fiber }
  // Memo and lazy preserve their wrapper tag around the same class instance.
  const instance = fiber.sn?._fiber === fiber ? fiber.sn : null
  // Hook has four fields. One flat snapshot preserves slot and dispatch
  // identity without a tuple and object clone for every hook.
  const hooks: any[] | null = fiber.hooks && []
  if (hooks) for (const hook of fiber.hooks!) {
    const queue = hook.q
    hooks.push(hook, hook.s, queue, hook.d, hook.c, queue && typeof queue === 'object' ? { ...queue } : null)
  }
  const memoized = fiber.ms && (instance || fiber.tag === FiberTag.Suspense || fiber.tag === FiberTag.Fragment)
    ? { ...fiber.ms } : null
  if (fiber.cx) saved.cx = new Map(fiber.cx)
  if (fiber.cu) saved.cu = fiber.cu.slice()
  const props = instance?.props, state = instance?.state, context = instance?.context
  onCommitRollback(() => {
    Object.assign(fiber, saved)
    if (memoized) {
      for (const key in fiber.ms) if (!(key in memoized)) delete fiber.ms[key]
      Object.assign(fiber.ms, memoized)
    }
    if (hooks) {
      fiber.hooks!.length = hooks.length / 6
      for (let index = 0; index < hooks.length; index += 6) {
        const hook: Hook = fiber.hooks![index / 6] = hooks[index]
        hook.s = hooks[index + 1]
        hook.q = hooks[index + 2]
        hook.d = hooks[index + 3]
        hook.c = hooks[index + 4]
        const queue = hooks[index + 5]
        if (queue) Object.assign(hook.q, queue)
      }
    }
    if (instance) { instance.props = props; instance.state = state; instance.context = context }
  })
  for (let child = fiber.child; child; child = child.sibling) rememberSubtree(child)
  if (fiber.tag === FiberTag.Suspense && fiber.ms?.f) rememberSubtree(fiber.ms.f)
}

export function rewindCommit(checkpoint: number): void {
  if (!currentCommit || checkpoint < 0) return
  const lengths = currentCommit.c[checkpoint]!
  const undo = currentCommit.q[3]!
  for (let index = undo.length - 1; index >= lengths[3]!; index--) undo[index]!()
  currentCommit.q.forEach((queue, index) => { queue.length = lengths[index]! })
  currentCommit.c.length = checkpoint
}

export function commitBeforeMutation(plan: CommitPlan): void {
  const queue = plan.q[0]!
  while (plan.b < queue.length) queue[plan.b++]!()
}

export function commitMutation(plan: CommitPlan): void {
  if (plan.m) return
  commitBeforeMutation(plan)
  if (plan.m) return
  plan.m = true
  const previous = activeCommit
  activeCommit = plan
  try {
    const mutations = plan.q[1]!
    for (let index = 0; index < mutations.length; index++) {
      const work = mutations[index]
      if (typeof work === 'function') work()
      else if (typeof work === 'string') mutations[++index].data = work
      else setProp(work, mutations[++index], mutations[++index], mutations[++index], mutations[++index])
    }
    for (const work of plan.q[2]!) work()
  } finally {
    activeCommit = previous
    for (const queue of plan.q) queue.length = 0
    plan.c.length = 0
  }
}

export function commitSynchronously(render: () => void): void {
  if (currentCommit) { render(); return }
  const plan = reusableCommit || createCommit()
  reusableCommit = undefined
  plan.b = 0
  plan.m = false
  try { commitMutation(prepareCommit(render, plan)) }
  finally {
    // Failed preparation must not leave work for a later synchronous root.
    if (!plan.m) {
      for (const queue of plan.q) queue.length = 0
      plan.c.length = 0
    }
    reusableCommit = plan
  }
}

import { FiberTag, type Fiber, type Hook, type Effect } from '../core'
import { onCommitRollback } from './commit'

export const retainedEffects = new WeakMap<Fiber, Map<Hook, Effect>>()

export function rememberRetainedEffect(fiber: Fiber, hook: Hook, effect: Effect): void {
  let entries = retainedEffects.get(fiber)
  if (!entries) {
    retainedEffects.set(fiber, entries = new Map())
    onCommitRollback(() => { retainedEffects.delete(fiber) })
  }
  const previous = entries.get(hook), target = entries
  onCommitRollback(() => { if (previous) target.set(hook, previous); else target.delete(hook) })
  entries.set(hook, effect)
}

export function setLayoutDisconnected(fiber: Fiber, disconnected: boolean): boolean {
  const previous = !!fiber.ld
  if (previous !== disconnected) {
    onCommitRollback(() => { fiber.ld = previous })
    fiber.ld = disconnected
  }
  return previous
}

export function walkRetained(fiber: Fiber, visit: (fiber: Fiber) => void, postorder = false): void {
  if (!postorder) visit(fiber)
  for (let child = fiber.child; child; child = child.sibling) walkRetained(child, visit, postorder)
  if (fiber.tag === FiberTag.Suspense && fiber.ms?.f) walkRetained(fiber.ms.f, visit, postorder)
  if (postorder) visit(fiber)
}

export function inSuspensePrimary(fiber: Fiber): boolean {
  for (let child = fiber, parent = fiber.parent; parent; child = parent, parent = parent.parent) {
    if (parent.tag === FiberTag.Suspense && parent.ms?.d && parent.ms.f !== child) return true
  }
  return false
}

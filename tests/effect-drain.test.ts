import { expect, it } from 'vitest'
import { createFiber, FiberTag, type FiberRoot } from '../packages/redact/src/core'
import { createFiberRoot } from '../packages/redact/src/dom/root-internal'
import { checkpointCommit, commitMutation, prepareCommit, rewindCommit } from '../packages/redact/src/dom/commit'
import { discardPendingEffects, enqueueEffect, flushFiberCommits, runEffects } from '../packages/redact/src/dom/reconcile'

function root() { return createFiberRoot(document.createElement('div'), { onUncaughtError: error => { throw error } }) }
function child(root: FiberRoot) {
  const fiber = createFiber(FiberTag.Function, () => null, null)
  fiber.root = root
  fiber.parent = root.r
  return fiber
}
function stage(root: FiberRoot, label: string, events: string[], during?: () => void) {
  const fiber = child(root)
  for (const t of [2, 1, 0] as const) {
    enqueueEffect(fiber, { t, c: () => {
      events.push(`${label}:${t}`)
      if (t === 2) during?.()
    } })
  }
  flushFiberCommits(fiber)
}

it('isolates a captured batch from reentrant cross-root draining and later effects', async () => {
  const first = root(), second = root(), events: string[] = []
  const plan = prepareCommit(() => {
    stage(first, 'first', events, () => {
      stage(second, 'reentrant', events)
      runEffects(second)
      stage(first, 'later', events)
    })
    runEffects(first)
  })
  commitMutation(plan)
  expect(events).toEqual(['first:2', 'first:1', 'reentrant:2', 'reentrant:1'])
  await Promise.resolve()
  expect(events).toEqual(['first:2', 'first:1', 'reentrant:2', 'reentrant:1', 'first:0', 'reentrant:0'])
  runEffects(first)
  await Promise.resolve()
  expect(events.slice(6)).toEqual(['later:2', 'later:1', 'later:0'])
  runEffects(second)
  expect(events).toHaveLength(9)
})

it('restores pending effects after rewinding a checkpoint that captured and replaced every queue', async () => {
  const state = root(), events: string[] = []
  const plan = prepareCommit(() => {
    stage(state, 'before', events)
    const checkpoint = checkpointCommit()
    stage(state, 'abandoned', events)
    runEffects(state)
    stage(state, 'also-abandoned', events)
    rewindCommit(checkpoint)
    stage(state, 'after', events)
    runEffects(state)
  })
  expect(events).toEqual([])
  commitMutation(plan)
  await Promise.resolve()
  expect(events).toEqual(['before:2', 'after:2', 'before:1', 'after:1', 'before:0', 'after:0'])
  runEffects(state)
  expect(events).toHaveLength(6)
})

it('retains already captured effects while discarding another root from the replacement queues', async () => {
  const first = root(), second = root(), events: string[] = []
  const plan = prepareCommit(() => {
    stage(first, 'captured', events)
    runEffects(first)
    stage(second, 'discarded', events)
    stage(first, 'retained', events)
    discardPendingEffects(second)
    runEffects(first)
  })
  commitMutation(plan)
  await Promise.resolve()
  expect(events).toEqual(['captured:2', 'captured:1', 'retained:2', 'retained:1', 'captured:0', 'retained:0'])
})

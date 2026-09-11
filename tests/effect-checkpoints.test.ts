import { expect, it } from 'vitest'
import { createFiber, FiberTag, REACT_FRAGMENT_TYPE, type Fiber, type FiberRoot } from '../packages/redact/src/core'
import { createFiberRoot } from '../packages/redact/src/dom/root-internal'
import { checkpointCommit, commitMutation, prepareCommit, rewindCommit } from '../packages/redact/src/dom/commit'
import { discardPendingEffects, enqueueEffect, flushFiberCommits, handleErrorInRender, RenderErrorCapture, runEffects } from '../packages/redact/src/dom/reconcile'

function root() { return createFiberRoot(document.createElement('div'), { onUncaughtError() {} }) }
function child(root: FiberRoot, parent = root.r, fragment = false) {
  const fiber = createFiber(fragment ? FiberTag.Fragment : FiberTag.Function, fragment ? REACT_FRAGMENT_TYPE : () => null, null)
  fiber.root = root
  fiber.parent = parent
  return fiber
}
function layout(fiber: Fiber, label: string, events: string[], complete = true) {
  enqueueEffect(fiber, { t: 1, c: () => { events.push(label) } })
  if (complete) flushFiberCommits(fiber)
}
function effects(fiber: Fiber, label: string, events: string[]) {
  for (const t of [2, 1, 0] as const) enqueueEffect(fiber, { t, c: () => { events.push(`${label}:${t}`) } })
  flushFiberCommits(fiber)
}

it('removes an abandoned Fragment insertion from before the checkpoint queue prefix', () => {
  const state = root(), events: string[] = []
  const fragment = child(state, state.r, true), descendant = child(state, fragment)
  const plan = prepareCommit(() => {
    layout(child(state), 'prefix', events)
    layout(descendant, 'committed descendant', events)
    const checkpoint = checkpointCommit()
    layout(fragment, 'abandoned fragment', events)
    layout(child(state, fragment), 'abandoned descendant', events)
    rewindCommit(checkpoint)
    layout(child(state), 'after', events)
    runEffects(state)
  })
  expect(events).toEqual([])
  commitMutation(plan)
  expect(events).toEqual(['prefix', 'committed descendant', 'after'])
})

it('restores staged parent work around a failed child and preserves Fragment ordering', () => {
  const state = root(), events: string[] = []
  const fragment = child(state, state.r, true), descendant = child(state, fragment)
  const plan = prepareCommit(() => {
    layout(fragment, 'fragment before', events, false)
    layout(descendant, 'descendant before', events)
    const checkpoint = checkpointCommit()
    layout(fragment, 'fragment abandoned', events)
    runEffects(state)
    rewindCommit(checkpoint)
    flushFiberCommits(fragment)
    runEffects(state)
  })
  commitMutation(plan)
  expect(events).toEqual(['fragment before', 'descendant before'])
})

it('restores nested checkpoints after interleaved root removals and multiple queue drains', async () => {
  const first = root(), second = root(), events: string[] = []
  const plan = prepareCommit(() => {
    effects(child(first), 'first before', events)
    effects(child(second), 'second before', events)
    const outer = checkpointCommit()
    effects(child(first), 'outer abandoned', events)
    const inner = checkpointCommit()
    discardPendingEffects(second)
    runEffects(first)
    effects(child(second), 'inner abandoned', events)
    runEffects(second)
    rewindCommit(inner)
    effects(child(second), 'outer also abandoned', events)
    runEffects(first)
    rewindCommit(outer)
    effects(child(first), 'after', events)
    runEffects(first)
  })
  expect(events).toEqual([])
  commitMutation(plan)
  await Promise.resolve()
  expect(events).toEqual([
    'first before:2', 'second before:2', 'after:2',
    'first before:1', 'second before:1', 'after:1',
    'first before:0', 'second before:0', 'after:0',
  ])
})

it('restores effects removed by render-error cleanup from before the checkpoint', async () => {
  const state = root(), events: string[] = [], fiber = child(state)
  const failure = new Error('abandoned render')
  const plan = prepareCommit(() => {
    effects(child(state), 'prefix', events)
    effects(fiber, 'retained', events)
    const checkpoint = checkpointCommit()
    layout(fiber, 'abandoned staged work', events, false)
    expect(() => handleErrorInRender(fiber, failure)).toThrow(RenderErrorCapture)
    rewindCommit(checkpoint)
    effects(child(state), 'after', events)
    runEffects(state)
  })
  commitMutation(plan)
  await Promise.resolve()
  expect(events).toEqual([
    'prefix:2', 'retained:2', 'after:2',
    'prefix:1', 'retained:1', 'after:1',
    'prefix:0', 'retained:0', 'after:0',
  ])
})

it('keeps successful work after an inner rewind but removes it when its outer attempt fails', () => {
  const state = root(), events: string[] = []
  const fragment = child(state, state.r, true), descendant = child(state, fragment)
  const plan = prepareCommit(() => {
    layout(descendant, 'retained descendant', events)
    const outer = checkpointCommit()
    layout(fragment, 'outer fragment', events)
    const inner = checkpointCommit()
    layout(fragment, 'inner fragment', events)
    runEffects(state)
    rewindCommit(inner)
    layout(child(state), 'outer after inner', events)
    rewindCommit(outer)
    layout(fragment, 'final fragment', events)
    runEffects(state)
  })
  commitMutation(plan)
  expect(events).toEqual(['final fragment', 'retained descendant'])
})

import { expect, it } from 'vitest'
import { createFiber, FiberTag, type FiberRoot } from '../packages/redact/src/core'
import { createFiberRoot } from '../packages/redact/src/dom/root-internal'
import {
  discardPendingEffects, flushFiberCommits, handleErrorInRender,
  renderFiber, runEffects, scheduleLifecycle, unmountFiber, withCurrentRoot,
} from '../packages/redact/src/dom/reconcile'

function root() { return createFiberRoot(document.createElement('div'), { onUncaughtError: () => {} }) }
function child(root: FiberRoot) {
  const fiber = createFiber(FiberTag.Function, () => null, null)
  fiber.root = root
  fiber.parent = root.r
  return fiber
}

for (const top of [false, true]) {
  for (const cleanup of ['root discard', 'unmount', 'render error'] as const) {
    it(`preserves another root's staged commits after ${cleanup} removes the ${top ? 'top' : 'middle'} entry`, () => {
      const first = root()
      const second = root()
      const removed = child(first)
      const retained = child(second)
      const log: string[] = []
      const stageRemoved = () => scheduleLifecycle(removed, () => { log.push('removed') })
      const stageRetained = () => scheduleLifecycle(retained, () => { log.push('retained') })
      if (top) { stageRetained(); stageRemoved() }
      else { stageRemoved(); stageRetained() }
      if (cleanup === 'root discard') discardPendingEffects(first)
      else if (cleanup === 'unmount') unmountFiber(removed, first.c)
      else withCurrentRoot(first, () => handleErrorInRender(removed, new Error('expected')))
      renderFiber(retained, second.c, null)
      runEffects(second)
      expect(log).toEqual(['retained'])
      discardPendingEffects(first)
      discardPendingEffects(second)
    })
  }
}

it('supports explicit out-of-order flushing without losing the active stack top', () => {
  const state = root()
  const first = child(state)
  const second = child(state)
  const log: string[] = []
  scheduleLifecycle(first, () => { log.push('first') })
  scheduleLifecycle(second, () => { log.push('second') })
  flushFiberCommits(first)
  renderFiber(second, state.c, null)
  runEffects(state)
  expect(log).toEqual(['first', 'second'])
})

it('pushes a fiber only once when it owns multiple staged commits', () => {
  const state = root()
  const first = child(state)
  const second = child(state)
  const log: string[] = []
  scheduleLifecycle(first, () => { log.push('first:1') })
  scheduleLifecycle(first, () => { log.push('first:2') })
  scheduleLifecycle(second, () => { log.push('second') })
  renderFiber(second, state.c, null)
  renderFiber(first, state.c, null)
  runEffects(state)
  expect(log).toEqual(['second', 'first:1', 'first:2'])
})

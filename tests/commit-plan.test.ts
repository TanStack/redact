import { expect, it } from 'vitest'
import { createFiber, FiberTag } from '../packages/redact/src/core/internal'
import { checkpointCommit, commitBeforeMutation, commitMutation, currentCommit, onCommitRollback, prepareCommit, queueBeforeMutation, queueCommitEffects, queueMutation, rewindCommit } from '../packages/redact/src/dom/commit'

it('separates snapshots, mutations and effects without repeating preparation', () => {
  const log: string[] = []
  let value = 'old'
  const plan = prepareCommit(() => {
    log.push('render')
    queueMutation(() => { value = 'new'; log.push('mutate') })
    queueBeforeMutation(() => log.push('snapshot:' + value))
    queueCommitEffects(() => log.push('effect:' + value))
  })
  expect(value).toBe('old')
  expect(currentCommit).toBeNull()
  commitBeforeMutation(plan)
  commitBeforeMutation(plan)
  commitMutation(plan)
  commitMutation(plan)
  expect(log).toEqual(['render', 'snapshot:old', 'mutate', 'effect:new'])
})

it('rewinds prepared subtree metadata and work while preserving hook identity', () => {
  const fiber = createFiber(FiberTag.Function, null, null)
  const hook = { s: 1, d: [1], c: null, q: { r: (value: number) => value } }
  fiber.hooks = [hook]
  const log: string[] = []
  const plan = prepareCommit(() => {
    queueMutation(() => log.push('before'))
    const checkpoint = checkpointCommit(fiber)
    hook.s = 2
    fiber.child = createFiber(FiberTag.Host, 'div', null)
    onCommitRollback(() => log.push('rollback'))
    queueMutation(() => log.push('discarded'))
    queueBeforeMutation(() => log.push('discarded snapshot'))
    queueCommitEffects(() => log.push('discarded effect'))
    rewindCommit(checkpoint)
    queueMutation(() => log.push('after'))
  })
  expect(fiber.child).toBeNull()
  expect(fiber.hooks?.[0]).toBe(hook)
  expect(hook.s).toBe(1)
  expect(plan.q[1]).toHaveLength(2)
  commitBeforeMutation(plan)
  commitMutation(plan)
  expect(log).toEqual(['rollback', 'before', 'after'])
})

it('restores the outer preparation scope when nested preparation throws', () => {
  const outer = prepareCommit(() => {
    const active = currentCommit
    expect(() => prepareCommit(() => { throw new Error('failed') })).toThrow('failed')
    expect(currentCommit).toBe(active)
  })
  expect(currentCommit).toBeNull()
  commitMutation(outer)
})

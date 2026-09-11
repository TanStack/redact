import { expect, it } from 'vitest'
import { createFiber, FiberTag } from '../packages/redact/src/core'
import { checkpointCommit, commitMutation, prepareCommit, rewindCommit } from '../packages/redact/src/dom/commit'

it('restores unknown own string and symbol fields, including deleted and undefined fields', () => {
  const fiber = createFiber(FiberTag.Function, null, null)
  const fields = fiber as unknown as Record<PropertyKey, unknown>
  const symbol = Symbol('future feature'), original = { value: 'before' }
  fiber.depth = 0
  fiber.ld = false
  fields.futureFeature = original
  fields.futureUndefined = undefined
  fields[symbol] = original
  Object.defineProperty(fiber, 'nonEnumerable', { value: 'before', writable: true })
  const plan = prepareCommit(() => {
    const checkpoint = checkpointCommit(fiber)
    delete fiber.depth
    delete fiber.ld
    fields.futureFeature = { value: 'abandoned' }
    delete fields.futureUndefined
    fields[symbol] = { value: 'abandoned' }
    fields.nonEnumerable = 'not snapshotted'
    rewindCommit(checkpoint)
  })
  expect(fiber.depth).toBe(0)
  expect(fiber.ld).toBe(false)
  expect(fields.futureFeature).toBe(original)
  expect(Object.hasOwn(fiber, 'futureUndefined')).toBe(true)
  expect(fields.futureUndefined).toBeUndefined()
  expect(fields[symbol]).toBe(original)
  expect(fields.nonEnumerable).toBe('not snapshotted')
  commitMutation(plan)
})

it('does not copy inherited enumerable properties from the snapshot prototype', () => {
  const key = '__redact_snapshot_inherited__'
  const prototype = Object.prototype as Record<string, unknown>
  const previous = Object.getOwnPropertyDescriptor(prototype, key)
  Object.defineProperty(prototype, key, { value: 'inherited', enumerable: true, configurable: true, writable: true })
  try {
    const fiber = createFiber(FiberTag.Function, null, null)
    const plan = prepareCommit(() => {
      const checkpoint = checkpointCommit(fiber)
      fiber.pp = { abandoned: true }
      rewindCommit(checkpoint)
    })
    expect(Object.hasOwn(fiber, key)).toBe(false)
    expect(fiber.pp).toBeNull()
    commitMutation(plan)
  } finally {
    if (previous) Object.defineProperty(prototype, key, previous)
    else delete prototype[key]
  }
})

it('retains assignment behavior for an unknown own accessor field', () => {
  const fiber = createFiber(FiberTag.Function, null, null)
  const writes: string[] = []
  let value = 'before'
  Object.defineProperty(fiber, 'futureAccessor', {
    enumerable: true,
    get: () => value,
    set: (next: string) => { writes.push(next); value = next },
  })
  const plan = prepareCommit(() => {
    const checkpoint = checkpointCommit(fiber)
    value = 'abandoned'
    rewindCommit(checkpoint)
  })
  expect(value).toBe('before')
  expect(writes).toEqual(['before'])
  commitMutation(plan)
})

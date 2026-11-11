import { expect, it } from 'vitest'
import { FiberTag, createFiber } from '../packages/redact/src/core'
import { pendingSuspenseWork } from '../packages/redact/src/dom/features/suspense-runtime'
import { pendingSuspenseWork as disabled } from '../packages/redact/src/dom/features/suspense-runtime/stub'

it('preserves pending descendants, retained-primary exclusion and fallback discovery', () => {
  const boundary = createFiber(FiberTag.Suspense, null, null)
  const leaf = createFiber(FiberTag.Function, null, null)
  boundary.c = leaf
  expect(pendingSuspenseWork(boundary)).toBe(false)
  leaf.g = true
  expect(pendingSuspenseWork(boundary)).toBe(true)
  leaf.su = boundary
  expect(pendingSuspenseWork(boundary)).toBe(false)
  leaf.su = null
  boundary.c = null
  boundary.b = { f: leaf }
  expect(pendingSuspenseWork(boundary)).toBe(true)
  expect(disabled).toBeUndefined()
})

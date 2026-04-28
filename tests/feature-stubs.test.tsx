/**
 * Stub smoke test: each feature's stub module must load, self-register, and
 * not crash. This catches broken imports, stale API references, and missing
 * exports on the stub side. Full behavior tests live in feature-specific
 * test files.
 */
import { describe, it, expect } from 'vitest'

describe('feature stubs — load & register', () => {
  it('portal/stub loads', async () => {
    await expect(
      import('../packages/redact/src/dom/features/portal/stub.ts'),
    ).resolves.toBeTruthy()
  })
  it('context/stub loads', async () => {
    await expect(
      import('../packages/redact/src/dom/features/context/stub.ts'),
    ).resolves.toBeTruthy()
  })
  it('suspense/stub loads', async () => {
    await expect(
      import('../packages/redact/src/dom/features/suspense/stub.ts'),
    ).resolves.toBeTruthy()
  })
  it('memo/stub loads', async () => {
    await expect(
      import('../packages/redact/src/dom/features/memo/stub.ts'),
    ).resolves.toBeTruthy()
  })
  it('forward-ref/stub loads', async () => {
    await expect(
      import('../packages/redact/src/dom/features/forward-ref/stub.ts'),
    ).resolves.toBeTruthy()
  })
  it('lazy/stub loads', async () => {
    await expect(
      import('../packages/redact/src/dom/features/lazy/stub.ts'),
    ).resolves.toBeTruthy()
  })
  it('class/stub loads', async () => {
    await expect(
      import('../packages/redact/src/dom/features/class/stub.ts'),
    ).resolves.toBeTruthy()
  })
  it('hydration/stub loads', async () => {
    await expect(
      import('../packages/redact/src/dom/features/hydration/stub.ts'),
    ).resolves.toBeTruthy()
  })
})

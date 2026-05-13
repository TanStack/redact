/**
 * Vite plugin feature-flag swap test. Verifies the resolveId hook redirects
 * `./<folder>` imports from `features/index.ts` to `./<folder>/stub` when the
 * matching feature flag is `false`.
 *
 * Regression: kebab-case folders (`forward-ref`, `class`) were previously
 * cast directly to `keyof ResolvedFeatures` (camelCase), so `'forward-ref' in
 * features` was always false and the swap never happened — silently keeping
 * the full implementation in the bundle even when the user opted out.
 */
import { describe, it, expect } from 'vitest'
import { redact } from '@tanstack/redact/vite'

const featuresIndex = '/abs/path/packages/redact/src/dom/features/index.ts'

interface ResolveCall {
  id: string
  importer: string
  opts: unknown
}

function makePlugin(features: Record<string, boolean>) {
  const plugin: any = redact({ preset: 'full', features })
  const calls: ResolveCall[] = []
  // Mimic Vite's resolveId context — the hook is called as a method, so `this`
  // must expose `resolve` and `environment.name`.
  const ctx = {
    environment: { name: 'client' },
    resolve(id: string, importer: string, opts: unknown) {
      calls.push({ id, importer, opts })
      return { id: `RESOLVED::${id}` }
    },
  }
  return { plugin, ctx, calls }
}

describe('redact() Vite plugin — feature flag → stub swap', () => {
  it('swaps ./forward-ref to ./forward-ref/stub when forwardRef=false', async () => {
    const { plugin, ctx, calls } = makePlugin({ forwardRef: false })
    const result = await plugin.resolveId.call(ctx, './forward-ref', featuresIndex, {})
    expect(calls).toHaveLength(1)
    expect(calls[0]!.id).toBe('./forward-ref/stub')
    expect(result).toBe('RESOLVED::./forward-ref/stub')
  })

  it('swaps ./class to ./class/stub when classComponents=false', async () => {
    const { plugin, ctx, calls } = makePlugin({ classComponents: false })
    const result = await plugin.resolveId.call(ctx, './class', featuresIndex, {})
    expect(calls).toHaveLength(1)
    expect(calls[0]!.id).toBe('./class/stub')
    expect(result).toBe('RESOLVED::./class/stub')
  })

  it('swaps ./portal, ./context, ./suspense, ./memo, ./lazy when their flags are false', async () => {
    const cases = ['portal', 'context', 'suspense', 'memo', 'lazy']
    for (const folder of cases) {
      const { plugin, ctx, calls } = makePlugin({ [folder]: false })
      const result = await plugin.resolveId.call(ctx, `./${folder}`, featuresIndex, {})
      expect(calls[0]!.id).toBe(`./${folder}/stub`)
      expect(result).toBe(`RESOLVED::./${folder}/stub`)
    }
  })

  it('does NOT swap when the feature flag is true (or unset, defaulting to full preset)', async () => {
    const { plugin, ctx, calls } = makePlugin({ forwardRef: true, classComponents: true })
    const r1 = await plugin.resolveId.call(ctx, './forward-ref', featuresIndex, {})
    const r2 = await plugin.resolveId.call(ctx, './class', featuresIndex, {})
    expect(calls).toHaveLength(0)
    // Falls through to the resolvedMap lookup (no match for these specifiers
    // because they aren't in ALIASES) → null.
    expect(r1).toBeNull()
    expect(r2).toBeNull()
  })

  it('skips the swap entirely in the rsc environment', async () => {
    const { plugin, ctx, calls } = makePlugin({ forwardRef: false })
    ;(ctx as any).environment.name = 'rsc'
    const result = await plugin.resolveId.call(ctx, './forward-ref', featuresIndex, {})
    expect(calls).toHaveLength(0)
    expect(result).toBeNull()
  })
})

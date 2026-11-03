// @vitest-environment node
import { it, expect } from 'vitest'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

it('omits owner diagnostics from production, matching React', async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../packages/redact/src/react/index.ts', import.meta.url))],
    bundle: true, platform: 'browser', format: 'esm', minify: true, write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const code = result.outputFiles[0]!.text
  expect(code).not.toContain('react-stack-top-frame')
  expect(code).not.toContain('stackBudget')
  const React = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
  expect(React.captureOwnerStack).toBeUndefined()
  expect(Object.hasOwn(React.default, 'captureOwnerStack')).toBe(false)
})

import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { redact } from '@tanstack/redact/vite'

describe('redact vite plugin', () => {
  it('aliases React DOM edge server entrypoints', async () => {
    const packageRoot = resolve(import.meta.dirname, '../packages/redact')
    const plugin = redact({
      packageRoots: {
        '@tanstack/redact': packageRoot,
      },
    })

    plugin.configResolved?.({
      root: resolve(import.meta.dirname, '..'),
      server: { fs: { allow: [] } },
    } as any)

    const context = { environment: { name: 'ssr' } }
    await expect(plugin.resolveId.call(context, 'react-dom/server.edge')).resolves.toMatch(
      /packages\/redact\/dist\/server\/index\.js$/,
    )
    await expect(plugin.resolveId.call(context, 'react-dom/static.edge')).resolves.toMatch(
      /packages\/redact\/dist\/server\/index\.js$/,
    )
  })
})

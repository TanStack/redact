import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { redact } from '@tanstack/redact/vite'

function flattenPlugins(plugins: any): Array<any> {
  return [plugins].flat(Infinity)
}

function findPlugin(plugins: any, name: string): any {
  const plugin = flattenPlugins(plugins).find((p) => p.name === name)
  expect(plugin).toBeDefined()
  return plugin
}

describe('redact vite plugin', () => {
  it('aliases React DOM edge server entrypoints', async () => {
    const packageRoot = resolve(import.meta.dirname, '../packages/redact')
    const plugin = findPlugin(redact({
      packageRoots: {
        '@tanstack/redact': packageRoot,
      },
    }), 'redact')

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

  it('prunes force-included React optimizer deps outside RSC', () => {
    const plugin = findPlugin(redact({
      skip: ['scheduler'],
    }), 'redact:optimize-deps-guard')
    const config = {
      optimizeDeps: {
        include: [
          'react',
          'react-dom/client',
          'scheduler',
          '@vitejs/plugin-rsc/vendor/react-server-dom/client.browser',
        ],
      },
      environments: {
        client: {
          optimizeDeps: {
            include: [
              'react',
              '@example/library > react-dom/client',
              'scheduler',
              '@tanstack/react-router > @tanstack/react-store',
            ],
          },
        },
        ssr: {
          optimizeDeps: {
            include: ['react-dom/server', 'scheduler'],
          },
        },
        rsc: {
          optimizeDeps: {
            include: ['react', 'react-dom/server'],
          },
        },
      },
    }

    plugin.configResolved(config)

    expect(config.optimizeDeps.include).toEqual([
      'scheduler',
      '@vitejs/plugin-rsc/vendor/react-server-dom/client.browser',
    ])
    expect(config.environments.client.optimizeDeps.include).toEqual([
      'scheduler',
      '@tanstack/react-router > @tanstack/react-store',
    ])
    expect(config.environments.ssr.optimizeDeps.include).toEqual(['scheduler'])
    expect(config.environments.rsc.optimizeDeps.include).toEqual([
      'react',
      'react-dom/server',
    ])
  })
})

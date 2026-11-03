// @vitest-environment node
import { expect, it } from 'vitest'
import { createServer as createDefaultServer, build as buildDefault } from 'vite'
const createServer = process.env.REDACT_VITE_TEST_ENTRY
  ? (await import(process.env.REDACT_VITE_TEST_ENTRY)).createServer
  : createDefaultServer
import { redact } from '@tanstack/redact/vite'
import { resolve, join } from 'node:path'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
const build = process.env.REDACT_VITE_TEST_ENTRY
  ? (await import(process.env.REDACT_VITE_TEST_ENTRY)).build
  : buildDefault

it.each([false, true])('keeps React shims canonical with package aliases, late plugin %s', async late => {
  const dedupe = { name: 'storybook:package-deduplication', enforce: 'pre' as const,
    config: () => ({ resolve: { alias: { react: '/installed/react', 'react-dom': '/installed/react-dom', '@mdx-js/react': '/installed/mdx' } } }) }
  const shim = redact({ packageRoots: { '@tanstack/redact': resolve(import.meta.dirname, '../packages/redact') } })
  const server = await createServer({ configFile: false, root: resolve(import.meta.dirname, '..'),
    plugins: late ? [shim, dedupe] : [dedupe, shim], server: { middlewareMode: true, ws: false },
    environments: { rsc: {} }, optimizeDeps: { noDiscovery: true }, })
  try {
    for (const [specifier, suffix] of [['react', '/react/index.ts'], ['react/jsx-runtime', '/react/jsx-runtime.ts'], ['react-dom/client', '/dom/client.ts'], ['react-dom/test-utils', '/dom/test-utils.ts'], ['react-dom/server', '/server/index.ts']]) {
      for (const name of ['client', 'ssr']) {
        const container = server.environments?.[name]?.pluginContainer ?? server.pluginContainer
        const result = await container.resolveId(specifier!, resolve(import.meta.dirname, 'entry.ts'), { ssr: name === 'ssr' })
        expect(result?.id).toMatch(new RegExp(suffix!.replace('.ts', '\\.[jt]s') + '$'))
      }
    }
    if (server.environments?.rsc) {
      const rsc = await server.environments.rsc.pluginContainer.resolveId('react', resolve(import.meta.dirname, 'entry.ts'))
      expect(rsc?.id).toContain('/installed/react')
    }
    const mdx = await (server.environments?.client?.pluginContainer ?? server.pluginContainer).resolveId('@mdx-js/react', resolve(import.meta.dirname, 'entry.ts'))
    expect(mdx?.id).toContain('/installed/mdx')
  } finally { await server.close() }
})


it('preserves skipped imports and unrelated regexp aliases', async () => {
  const server = await createServer({ configFile: false, root: resolve(import.meta.dirname, '..'),
    plugins: [redact({ skip: ['react'], packageRoots: { '@tanstack/redact': resolve(import.meta.dirname, '../packages/redact') } })],
    resolve: { alias: [{ find: /^react$/, replacement: '/installed/react' }, { find: /^example$/, replacement: '/installed/example' }] },
    server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true }, })
  try {
    const container = server.environments?.client?.pluginContainer ?? server.pluginContainer
    expect((await container.resolveId('react'))?.id).toContain('/installed/react')
    expect((await container.resolveId('example'))?.id).toContain('/installed/example')
    expect((await container.resolveId('react-dom/client'))?.id).toMatch(/\/dom\/client\.[jt]s$/)
  } finally { await server.close() }
})

it('resolves managed imports before regexp aliases', async () => {
  const server = await createServer({ configFile: false, root: resolve(import.meta.dirname, '..'),
    plugins: [redact({ packageRoots: { '@tanstack/redact': resolve(import.meta.dirname, '../packages/redact') } })],
    resolve: { alias: [{ find: /^react(?:\/(.*))?$/, replacement: '/installed/react/$1' }] },
    server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true }, })
  try {
    const container = server.environments?.client?.pluginContainer ?? server.pluginContainer
    expect((await container.resolveId('react'))?.id).toMatch(/\/react\/index\.[jt]s$/)
    expect((await container.resolveId('react/jsx-runtime'))?.id).toMatch(/\/react\/jsx-runtime\.[jt]s$/)
  } finally { await server.close() }
})

it('bundles the canonical runtime when another plugin supplies React package aliases', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'redact-canonical-'))
  try {
    const entry = join(directory, 'entry.js')
    await writeFile(entry, "export { useState } from 'react'; export { jsx } from 'react/jsx-runtime'; export { createRoot } from 'react-dom/client';")
    const result = await build({ configFile: false, root: directory, logLevel: 'silent',
      plugins: [{ name: 'storybook:package-deduplication', enforce: 'pre',
        config: () => ({ resolve: { alias: { react: '/installed/react', 'react-dom': '/installed/react-dom' } } }) },
        redact({ packageRoots: { '@tanstack/redact': resolve(import.meta.dirname, '../packages/redact') } })],
      build: { write: false, minify: false, lib: { entry, formats: ['es'], fileName: 'runtime' } },
    })
    const exportsFound: string[] = []
    let hasInstalledAlias = false
    for (const bundle of [result].flat()) {
      if (!('output' in bundle)) throw new Error('Expected a completed build')
      for (const file of bundle.output) {
        if (file.type === 'chunk') {
          exportsFound.push(...file.exports)
          hasInstalledAlias ||= file.code.includes('/installed/react')
        }
      }
    }
    expect(exportsFound).toEqual(expect.arrayContaining(['useState', 'jsx', 'createRoot']))
    expect(hasInstalledAlias).toBe(false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('keeps disabled features stubbed in the development module graph with a version query', async () => {
  const packageRoot = resolve(import.meta.dirname, '../packages/redact')
  const server = await createServer({ configFile: false, root: resolve(import.meta.dirname, '..'),
    plugins: [redact({ preset: 'nano', packageRoots: { '@tanstack/redact': packageRoot } })],
    server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true },
  })
  try {
    for (const [module, features] of [
      ['features/index', ['context', 'forward-ref', 'memo', 'lazy', 'suspense', 'portal', 'activity', 'class']],
      ['dispatcher', ['view-transition', 'hydration']],
      ['reconcile', ['fragment-refs', 'view-transition', 'hydration']],
    ] satisfies [string, string[]][]) {
      const transformed = await server.transformRequest(`${packageRoot}/dist/dom/${module}.js?v=fixture`)
      expect(transformed).not.toBeNull()
      for (const feature of features) {
        expect(transformed!.code).toContain(`/features/${feature}/stub.js`)
        expect(transformed!.code).not.toContain(`/features/${feature}/index.js`)
      }
    }
  } finally { await server.close() }
})

// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'vite'
import { redact } from '../packages/redact/src/vite/index'

const { JSDOM } = createRequire(import.meta.url)('jsdom')

async function bundle(preset: 'full' | 'nano', entry: 'index' | '_all', used: boolean) {
  const path = resolve(import.meta.dirname, `../packages/redact/src/dom/${entry}.ts`)
  const fixture = '\0resource-hints-entry-fixture'
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      ...redact({ preset }),
      {
        name: 'resource-hints-entry-fixture',
        resolveId(id) { if (id === fixture) return id },
        load(id) {
          if (id === fixture) return `export { ${used ? 'preload, preinit' : 'flushSync'} } from ${JSON.stringify(path)}`
        },
      },
    ],
    build: {
      write: false,
      minify: true,
      rollupOptions: { input: fixture, preserveEntrySignatures: 'strict', output: { format: 'iife', name: 'ResourceAPI' } },
    },
  })
  const output = Array.isArray(result) ? result[0] : result
  if (!output || !('output' in output)) throw new Error('Expected completed Vite bundle')
  const chunk = output.output.find(item => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Expected JavaScript chunk')
  return chunk
}

describe('resource hint entrypoints', () => {
  it.each([
    { preset: 'full', entry: 'index' },
    { preset: 'nano', entry: 'index' },
    { preset: 'full', entry: '_all' },
    { preset: 'nano', entry: '_all' },
  ] as const)('keeps real resource APIs in $entry with the $preset Vite preset', async ({ preset, entry }) => {
    const chunk = await bundle(preset, entry, true)
    const dom = new JSDOM('', { url: 'https://resource.test' })
    try {
      const { document } = dom.window
      const api = new Function('document', chunk.code + ';return ResourceAPI')(document)
      api.preload('/script.js', { as: 'script', integrity: 'sha256-test' })
      api.preinit('/script.js', { as: 'script' })
      expect(document.head.querySelectorAll('link[rel="preload"]')).toHaveLength(1)
      expect(document.head.querySelectorAll('script[async]')).toHaveLength(1)
      expect(document.head.querySelector('script')!.getAttribute('integrity')).toBe('sha256-test')
    } finally {
      dom.window.close()
    }
  })

  it.each(['full', 'nano'] as const)('removes unused resource implementation in the $preset Vite preset', async preset => {
    const chunk = await bundle(preset, 'index', false)
    expect(chunk.code).not.toContain('modulepreload')
    expect(chunk.code).not.toContain('dns-prefetch')
    expect(Object.entries(chunk.modules).filter(([path]) => path.endsWith('/dom/resource-hints.ts')).every(([, module]) => module.renderedLength === 0)).toBe(true)
  })
})

// @vitest-environment node
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { expect, it, vi } from 'vitest'

const { JSDOM } = createRequire(import.meta.url)('jsdom')

it('removes the refresh bridge and all hook interaction from production bundles', async () => {
  const source = resolve(import.meta.dirname, '../packages/redact/src')
  const result = await build({
    stdin: {
      contents: `
        import { createRoot } from ${JSON.stringify(source + '/dom/client.ts')};
        import { createElement } from ${JSON.stringify(source + '/react/index.ts')};
        const root = createRoot(document.body);
        root.render(createElement('button', null, 'production'));
        root.unmount();
      `,
      resolveDir: source,
    },
    bundle: true,
    write: false,
    format: 'iife',
    minify: true,
    metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const code = result.outputFiles[0]!.text
  expect(code).not.toContain('__REACT_DEVTOOLS_GLOBAL_HOOK__')
  expect(code).not.toContain('scheduleRefresh')
  for (const output of Object.values(result.metafile!.outputs)) {
    for (const [file, input] of Object.entries(output.inputs)) {
      if (file.endsWith('/dom/refresh.ts')) expect(input.bytesInOutput).toBe(0)
    }
  }
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' })
  const inject = vi.fn()
  dom.window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { inject }
  dom.window.eval(code)
  expect(inject).not.toHaveBeenCalled()
  expect(dom.window.document.body.childNodes).toHaveLength(0)
  dom.window.close()
})

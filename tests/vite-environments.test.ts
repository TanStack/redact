// @vitest-environment node
import { expect, it } from 'vitest'
import { resolve } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { build } from 'vite'
import { redact } from '@tanstack/redact/vite'

it.each(['client', 'ssr'] as const)('only substitutes React in the selected %s environment', async selected => {
  const plugins = redact({ environments: [selected], preset: 'nano', packageRoots: { '@tanstack/redact': resolve(import.meta.dirname, '../packages/redact') } })
  const plugin = plugins.find((item: { name: string }) => item.name === 'redact')
  plugin.configResolved({ root: resolve(import.meta.dirname, '..') })
  const config = plugin.config()
  expect(Object.keys(config.environments)).toEqual([selected])
  for (const name of ['client', 'ssr', 'rsc']) {
    const actual = await plugin.resolveId.call({ environment: { name } }, 'react')
    expect(actual !== null).toBe(name === selected)
  }
  // Vite 5 communicates SSR through hook options instead of an environment.
  expect(await plugin.resolveId.call({}, 'react', undefined, { ssr: true }) !== null).toBe(selected === 'ssr')
  expect(await plugin.resolveId.call({ environment: { name: 'worker', config: { consumer: 'server' } } }, 'react') !== null).toBe(selected === 'ssr')
})

it('keeps native SSR optimizer includes when only the browser uses Redact', () => {
  const plugins = redact({ environments: ['client'] })
  const guard = plugins.find((item: { name: string }) => item.name === 'redact:optimize-deps-guard')
  const config = {
    optimizeDeps: { include: ['react', 'other'] },
    environments: {
      client: { optimizeDeps: { include: ['react', 'other'] } },
      ssr: { optimizeDeps: { include: ['react', 'other'] } },
      rsc: { optimizeDeps: { include: ['react', 'other'] } },
    },
  }
  guard.configResolved(config)
  expect(config.optimizeDeps.include).toEqual(['other'])
  expect(config.environments.client.optimizeDeps.include).toEqual(['other'])
  expect(config.environments.ssr.optimizeDeps.include).toEqual(['react', 'other'])
  expect(config.environments.rsc.optimizeDeps.include).toEqual(['react', 'other'])
})

it('does not swap feature modules in an unselected SSR environment', async () => {
  const plugin = redact({ environments: ['client'], preset: 'nano' }).find((item: { name: string }) => item.name === 'redact')
  const context = { environment: { name: 'ssr' }, resolve() { throw new Error('Native SSR must not be rewritten') } }
  expect(await plugin.resolveId.call(context, './portal', '/package/src/dom/features/index.ts')).toBeNull()
})

it.each([{ selected: 'client', native: true }, { selected: 'ssr', native: false }] as const)('executes the selected $selected runtime in a Vite 5 SSR bundle', async ({ selected, native }) => {
  const root = mkdtempSync(resolve(tmpdir(), 'redact-native-ssr-'))
  try {
    symlinkSync(resolve(import.meta.dirname, '../node_modules'), resolve(root, 'node_modules'), 'dir')
    writeFileSync(resolve(root, 'package.json'), JSON.stringify({ type: 'module' }))
    writeFileSync(resolve(root, 'entry.js'), `import {createElement,createContext} from 'react';import {renderToString} from 'react-dom/server';export default {html:renderToString(createElement('main',null,'SSR')),native:!Object.hasOwn(createContext(null),'_context')}`)
    // Compile the actual source entries so this unit gate also works before a package build.
    const sourcePackage = resolve(root, 'source-package')
    mkdirSync(sourcePackage)
    symlinkSync(resolve(import.meta.dirname, '../packages/redact/src/react'), resolve(sourcePackage, 'react'), 'dir')
    symlinkSync(resolve(import.meta.dirname, '../packages/redact/src/server'), resolve(sourcePackage, 'server'), 'dir')
    writeFileSync(resolve(sourcePackage, 'package.json'), JSON.stringify({ name: '@tanstack/redact', exports: {
      '.': './react/index.ts',
      './server': './server/index.ts',
    } }))
    await build({
      root, configFile: false, logLevel: 'silent',
      plugins: redact({ environments: [selected], resolveFrom: root, packageRoots: { '@tanstack/redact': sourcePackage } }),
      build: { ssr: resolve(root, 'entry.js'), outDir: 'dist', minify: false },
    })
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', "import value from './dist/entry.js';console.log(JSON.stringify(value))"], { cwd: root, encoding: 'utf8' })
    expect(JSON.parse(output)).toEqual({ html: '<main>SSR</main>', native })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('leaves the native SSR protocol untouched when adapting a React 18 browser', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'redact-react18-environment-'))
  try {
    mkdirSync(resolve(root, 'node_modules/react'), { recursive: true })
    writeFileSync(resolve(root, 'node_modules/react/package.json'), JSON.stringify({ version: '18.3.1' }))
    const plugins = redact({ environments: ['client'], resolveFrom: root, packageRoots: { '@tanstack/redact': resolve(import.meta.dirname, '../packages/redact') } })
    const main = plugins.find((item: { name: string }) => item.name === 'redact')
    const compiler = plugins.find((item: { name: string }) => item.name === 'redact:react18')
    main.configResolved({ root })
    const id = await main.resolveId.call({}, 'react')
    const code = "export const version = '19.2.3'; export default { version: '19.2.3' };"
    const require = createRequire(import.meta.url)
    const { parseAst } = createRequire(require.resolve('vite'))('rollup/parseAst')
    expect(compiler.transform.call({ environment: { name: 'ssr' }, parse: parseAst }, code, id)).toBeNull()
    expect(compiler.transform.call({ parse: parseAst }, code, id, { ssr: true })).toBeNull()
    expect(compiler.transform.call({ environment: { name: 'client' }, parse: parseAst }, code, id).code).toContain('18.3.1')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

 it.each(['client', 'ssr'] as const)('keeps canonical imports in the selected %s environment only', async selected => {
  const plugins = redact({ environments: [selected], packageRoots: { '@tanstack/redact': resolve(import.meta.dirname, '../packages/redact') } })
  plugins.find((p: any) => p.name === 'redact').configResolved({ root: resolve(import.meta.dirname, '..') })
  const hook = plugins.find((p: any) => p.name === 'redact:canonical-imports').resolveId.handler
  for (const name of ['client', 'ssr', 'rsc']) expect((await hook.call({ environment: { name } }, 'react')) !== null).toBe(name === selected)
  expect(await hook.call({}, 'react', undefined, { ssr: true }) !== null).toBe(selected === 'ssr')
})

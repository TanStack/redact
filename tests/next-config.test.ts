// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { withRedact } from '../packages/redact/src/next'

const nextVersion = vi.hoisted(() => ({ value: '16.4.3' }))
vi.mock('node:module', async importOriginal => {
  const original = await importOriginal<typeof import('node:module')>()
  return { ...original, createRequire: (path: string | URL) => {
    const require = original.createRequire(path)
    return (id: string) => id === 'next/package.json' ? { version: nextVersion.value } : require(id)
  } }
})
beforeEach(() => { nextVersion.value = '16.4.3' })

class ReplacementPlugin {
  constructor(public pattern: RegExp, public replace: (resource: { request: string }) => void) {}
}
const webpack = { NormalModuleReplacementPlugin: ReplacementPlugin }

describe('withRedact', () => {
  it.each(['15.5.28', '16.0.11', '16.4.3'])('replaces every supported Webpack browser entry on Next %s', version => {
    nextVersion.value = version
    const config = withRedact() as any
    const plugin = config.webpack({}, { isServer: false, webpack }).plugins[0]
    for (const entry of ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react/compiler-runtime', 'react-dom', 'react-dom/client', 'react-dom/test-utils', 'react-dom/server', 'react-dom/server.browser', 'react-dom/server.edge', 'react-dom/server.node', 'react-dom/server.bun', 'scheduler']) {
      const requests = [entry]
      if (entry.startsWith('react')) {
        const [pkg, ...path] = entry.split('/')
        requests.push(`next/dist/compiled/${entry}`, `next/dist/compiled/${pkg}-experimental${path.length ? '/' + path.join('/') : ''}`)
      }
      for (const request of requests) {
        const resource = { request }
        expect(plugin.pattern.test(request)).toBe(true)
        plugin.replace(resource)
        expect(resource.request).toMatch(/\/packages\/redact\/src\/.+\.js$/)
      }
    }
    for (const request of ['react-server-dom-webpack/client', 'react-server-dom-turbopack/client', 'react-native', 'some-react-library', 'react/unknown']) {
      const resource = { request }
      plugin.replace(resource)
      expect(resource.request).toBe(request)
    }
  })

  it('corrects Next 16.2 cache detection only in development browser modules', () => {
    nextVersion.value = '16.2.12'
    const config = withRedact() as any
    const rules = config.turbopack.rules['*.js']
    const rule = rules.find((item: any) => item.loaders[0].loader.endsWith('/dev-cache-loader.cjs'))
    expect(rule.condition.all[0]).toBe('browser')
    expect(rule.condition.all[2]).toBe('development')
    for (const folder of ['client', 'esm/client']) {
      const path = `/app/node_modules/next/dist/${folder}/dev/debug-channel.js`
      expect(rule.condition.all[1].path.test(path)).toBe(true)
      const browser = config.webpack({}, { isServer: false, dev: true, webpack })
      expect(browser.module.rules[0].test.test(path)).toBe(true)
      expect(browser.module.rules[0].use[0].loader).toBe(rule.loaders[0].loader)
    }
    expect(rule.condition.all[1].path.test('/app/node_modules/next/dist/server/dev/debug-channel.js')).toBe(false)
    expect(config.webpack({}, { isServer: true, dev: true, webpack }).module).toBeUndefined()
    expect(config.webpack({}, { isServer: false, dev: false, webpack }).module).toBeUndefined()
  })

  it.each(['15.5.28', '16.0.11', '16.1.7', '16.3.8', '16.4.3'])('leaves Next %s debug channels unchanged', version => {
    nextVersion.value = version
    const config = withRedact() as any
    expect(JSON.stringify(config.turbopack)).not.toContain('dev-cache-loader')
    expect(config.webpack({}, { isServer: false, dev: true, webpack }).module).toBeUndefined()
  })

  it('preserves existing loader arrays without mutating the input', () => {
    const rule = { condition: 'browser', loaders: ['existing-loader'] }
    const input = { turbopack: { rules: { '*.js': [rule] } } }
    const output = withRedact(input) as any
    expect(input.turbopack.rules['*.js']).toEqual([rule])
    expect(output.turbopack.rules['*.js'][0]).toBe(rule)
    expect(output.turbopack.rules['*.js']).toHaveLength(14)
    expect((withRedact({ turbopack: { rules: { '*.js': rule } } }) as any).turbopack.rules['*.js'][0]).toBe(rule)
  })

  it('supports synchronous and asynchronous phase configuration', async () => {
    const defaults = { marker: true }
    const sync = withRedact((phase: string, context: any) => ({ phase, context, output: 'standalone' }))
    expect(sync('phase-production-build', defaults)).toMatchObject({ phase: 'phase-production-build', context: defaults, output: 'standalone', webpack: expect.any(Function) })
    const asyncConfig = withRedact(async (phase: string) => ({ phase }))
    expect(await asyncConfig('phase-development-server')).toMatchObject({ phase: 'phase-development-server', webpack: expect.any(Function) })
    expect(await withRedact(Promise.resolve({ output: 'standalone' }))).toMatchObject({ output: 'standalone', webpack: expect.any(Function) })
  })

  it('uses browser-only Next 15 loader conditions and rejects collisions', () => {
    nextVersion.value = '15.5.28'
    const output = withRedact({ turbopack: { rules: { '*.svg': { loaders: ['svg'] } } } }) as any
    for (const path of ['react/index', 'react-dom/client', 'next/dist/compiled/react-experimental/jsx-runtime']) {
      const rule = output.turbopack.rules[`**/node_modules/${path}.js`]
      expect(Object.keys(rule)).toEqual(['browser'])
      expect(rule.browser.loaders[0].loader).toMatch(/next\/loader\.cjs$/)
      expect(rule.browser.loaders[0].options.target).toMatch(/\/packages\/redact\/src\/.+\.js$/)
    }
    expect(output.turbopack.rules['*.svg']).toEqual({ loaders: ['svg'] })
    expect(output.turbopack.rules['*.js']).toBeUndefined()
    expect(() => withRedact({ turbopack: { rules: { '**/node_modules/react/index.js': false } } })).toThrow('Conflicting Turbopack rule')
  })

  it('rejects unsupported minors, majors, prereleases, and malformed versions', () => {
    for (const value of ['14.2.35', '15.4.0', '15.6.0', '16.5.0', '17.0.0', '16.4.3-canary.0', 'unknown']) {
      nextVersion.value = value
      expect(() => withRedact()).toThrow('supports stable Next.js 15.5 and 16.0 through 16.4')
    }
  })

  it('emits valid relative loader exports, including paths with spaces and quotes', () => {
    const loader = createRequire(import.meta.url)('../packages/redact/src/next/loader.cjs')
    for (const defaultExport of [true, false]) {
      const result = loader.call({ resourcePath: '/fixture/node_modules/react/index.js', getOptions: () => ({ target: '/fixture/redact package/quote"/react.js', defaultExport }) })
      expect(result).toBe('export * from "../../redact package/quote\\\"/react.js";' + (defaultExport ? '\nexport { default } from "../../redact package/quote\\\"/react.js";' : ''))
    }
    expect(loader.call({ resourcePath: '/fixture/react.js', getOptions: () => ({ target: '/fixture/redact.js' }) })).toBe('export * from "./redact.js";')
  })
  it('preserves user configuration and keeps the server compiler on React', () => {
    const plugin = {}
    const input = {
      output: 'standalone',
      webpack(config: any) { return { ...config, marker: true } },
      turbopack: { resolveAlias: { example: './example.js' }, rules: { '*.svg': { loaders: ['svg-loader'] } } },
    }
    const config = withRedact(input) as any
    expect(config.output).toBe('standalone')
    expect(config.turbopack.resolveAlias).toEqual(input.turbopack.resolveAlias)
    expect(config.turbopack.rules['*.svg']).toEqual(input.turbopack.rules['*.svg'])
    const server = config.webpack({ plugins: [plugin] }, { isServer: true, webpack })
    expect(server).toEqual({ plugins: [plugin], marker: true })
    const client = config.webpack({ plugins: [plugin] }, { isServer: false, webpack })
    expect(client.marker).toBe(true)
    expect(client.plugins[0]).toBe(plugin)
    for (const name of ['react', 'react-dom/client', 'next/dist/compiled/react-experimental/jsx-runtime']) {
      const resource = { request: name }
      expect(client.plugins[1].pattern.test(name)).toBe(true)
      client.plugins[1].replace(resource)
      expect(resource.request).toContain('/packages/redact/src/')
    }
    const flight = { request: 'react-server-dom-webpack/client' }
    client.plugins[1].replace(flight)
    expect(flight.request).toBe('react-server-dom-webpack/client')
  })

  it('replaces resolved browser entries in Turbopack without loading into the server', () => {
    const config = withRedact() as any
    const rules = config.turbopack.rules['*.js']
    for (const path of [
      'node_modules/next/dist/compiled/react/index.js',
      'node_modules/next/dist/compiled/react-dom/client.js',
      'node_modules/react/jsx-runtime.js',
      'node_modules/react-dom/server.browser.js',
      'node_modules/next/dist/compiled/react-dom/server.browser.js',
      'node_modules/next/dist/compiled/react-dom-experimental/server.browser.js',
      'node_modules/next/dist/compiled/react-experimental/index.js',
    ]) {
      const matching = rules.filter((rule: any) => rule.condition.all[1].path.test(path))
      expect(matching).toHaveLength(1)
      expect(matching[0].condition.all[0]).toBe('browser')
      expect(matching[0].loaders[0].loader).toMatch(/next\/loader\.cjs$/)
      if (path.includes('server.browser')) {
        expect(matching[0].loaders[0].options.defaultExport).toBe(true)
        expect(matching[0].loaders[0].options.target).toMatch(/server\/index\.js$/)
      }
    }
    expect(rules.some((rule: any) => rule.condition.all[1].path.test('node_modules/react-server-dom-turbopack/index.js'))).toBe(false)
  })
})

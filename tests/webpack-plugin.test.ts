import { expect, it } from 'vitest'
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { selectedFeatureResource, redact } from '../packages/redact/src/webpack/index'
import { resolveFeatures } from '../packages/redact/src/bundler-core/selection'

it('only swaps canonical runtime feature entries and retains query and fragment suffixes', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'redact-selection-')))
  try {
    for (const root of ['runtime', 'runtime-other', 'application']) {
      const feature = join(dir, root, 'dist/dom/features/context')
      mkdirSync(feature, { recursive: true })
      writeFileSync(join(feature, 'index.js'), '')
      writeFileSync(join(feature, 'stub.js'), '')
    }
    symlinkSync(join(dir, 'runtime'), join(dir, 'linked'), 'dir')
    const full = resolveFeatures('full', {})
    const nano = resolveFeatures('nano', {})
    const resource = join(dir, 'runtime/dist/dom/features/context/index.js')
    expect(selectedFeatureResource(resource, join(dir, 'runtime'), full)).toBeNull()
    expect(selectedFeatureResource(resource + '?raw#part', join(dir, 'runtime'), nano)).toBe(resource.replace('index.js', 'stub.js') + '?raw#part')
    expect(selectedFeatureResource(join(dir, 'linked/dist/dom/features/context/index.js'), join(dir, 'runtime'), nano)).toBe(resource.replace('index.js', 'stub.js'))
    for (const root of ['application', 'runtime-other']) {
      expect(selectedFeatureResource(join(dir, root, 'dist/dom/features/context/index.js'), join(dir, 'runtime'), nano)).toBeNull()
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it('rejects server targets before installing aliases or hooks', () => {
  const compiler = {
    context: '/', options: { target: 'node', resolve: {}, module: { rules: [] } },
    hooks: { normalModuleFactory: { tap() { throw new Error('unexpected hook') } } },
  }
  expect(() => redact().apply(compiler)).toThrow('browser SPA')
  expect(compiler.options.resolve).toEqual({})
  expect(compiler.options.module.rules).toEqual([])
})

it('prioritizes exact Redact aliases without discarding unrelated application aliases', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'redact-aliases-')))
  try {
    mkdirSync(join(root, 'dist/react'), { recursive: true })
    writeFileSync(join(root, 'dist/react/index.js'), '')
    const exports: Record<string, { default: string }> = {}
    for (const name of ['', 'jsx-runtime', 'jsx-dev-runtime', 'compiler-runtime', 'dom-client', 'dom', 'server', 'dom-test-utils', 'scheduler']) {
      exports[name ? './' + name : '.'] = { default: './dist/react/index.js' }
    }
    writeFileSync(join(root, 'package.json'), JSON.stringify({ exports }))
    const previous = { react: '/app/react-prefix', 'react$': '/app/old-react', application: '/app/owned' }
    let resolveHook: ((data: { createData?: { resource?: string } }) => void) | undefined
    const compiler = {
      context: root,
      options: { target: 'web', resolve: { alias: previous }, module: { rules: [] } },
      hooks: { normalModuleFactory: { tap(_name: string, callback: (factory: { hooks: { afterResolve: { tap(name: string, callback: (data: { createData?: { resource?: string } }) => void): void } } }) => void) {
        callback({ hooks: { afterResolve: { tap(_name, callback) { resolveHook = callback } } } })
      } } },
    }
    redact({ packageRoots: { '@tanstack/redact': root } }).apply(compiler)
    expect(compiler.options.resolve.alias['react$']).toBe(join(root, 'dist/react/index.js'))
    expect(compiler.options.resolve.alias.application).toBe('/app/owned')
    expect(Object.keys(compiler.options.resolve.alias).indexOf('react$')).toBeLessThan(Object.keys(compiler.options.resolve.alias).indexOf('react'))
    expect(() => resolveHook?.({})).not.toThrow()
  } finally { rmSync(root, { recursive: true, force: true }) }
})

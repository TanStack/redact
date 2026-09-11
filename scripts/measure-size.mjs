import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const featureDirectories = {
  activity: 'activity', fragmentRefs: 'fragment-refs', viewTransitions: 'view-transition',
  portal: 'portal', context: 'context', suspense: 'suspense', memo: 'memo',
  forwardRef: 'forward-ref', lazy: 'lazy', classComponents: 'class', hydration: 'hydration',
}

export const sizeEntries = [
  { name: 'redact', path: 'react/index' },
  { name: 'redact/jsx-runtime', path: 'react/jsx-runtime' },
  { name: 'redact/dom', path: 'dom/index' },
  { name: 'redact/dom-client', path: 'dom/client' },
  { name: 'redact/server', path: 'server/index' },
  { name: 'client total', virtual: true },
  { name: 'client total (default Vite)', virtual: true, features: { viewTransitions: false } },
  ...Object.keys(featureDirectories).map(feature => ({
    name: `redact/dom-client (${feature}=stub)`, path: 'dom/client', features: { [feature]: false },
  })),
  {
    name: 'redact/dom-client (nano)', path: 'dom/client',
    features: Object.fromEntries(Object.keys(featureDirectories).map(feature => [feature, false])),
  },
]

function featureSwapPlugin(features, extension) {
  const disabled = new Set(Object.entries(featureDirectories)
    .filter(([feature]) => features[feature] === false).map(([, directory]) => directory))
  return {
    name: 'size-feature-swap',
    setup(builder) {
      builder.onResolve({ filter: /^\./ }, args => {
        if (!args.importer) return null
        const registration = /[/\\]features[/\\]index\.[jt]s$/.test(args.importer)
          ? args.path.match(/^\.\/([a-z-]+)(?:\/index\.js)?$/)?.[1] : undefined
        const peer = args.path.match(/[/\\](context|hydration|fragment-refs|view-transition)(?:\/index\.js)?$/)?.[1]
        const directory = registration || peer
        if (!directory || !disabled.has(directory)) return null
        const stub = resolve(dirname(args.importer), args.path.replace(/\/index\.js$/, ''), `stub.${extension}`)
        return stub.replaceAll('\\', '/').endsWith(`/dom/features/${directory}/stub.${extension}`)
          ? { path: stub } : null
      })
    },
  }
}

export async function measureSizes(tree = 'dist') {
  assert(['src', 'dist'].includes(tree), 'SIZE_TREE must be src or dist')
  const extension = tree === 'src' ? 'ts' : 'js'
  const packageRoot = resolve(process.env.SIZE_PACKAGE_ROOT || resolve(root, 'packages/redact'))
  const source = resolve(packageRoot, tree)
  assert(existsSync(resolve(source, `dom/client.${extension}`)), `Missing ${tree} build. Run pnpm build first.`)
  const alias = Object.fromEntries(Object.entries({
    '@tanstack/redact/jsx-runtime': 'react/jsx-runtime',
    '@tanstack/redact/dom-client': 'dom/client',
    '@tanstack/redact/dom': 'dom/index',
    '@tanstack/redact/server': 'server/index',
    '@tanstack/redact': 'react/index',
  }).map(([name, entry]) => [name, resolve(source, `${entry}.${extension}`)]))
  const rows = []
  for (const entry of sizeEntries) {
    const result = await build({
      ...(entry.virtual ? { stdin: {
        contents: ['@tanstack/redact', '@tanstack/redact/jsx-runtime', '@tanstack/redact/dom', '@tanstack/redact/dom-client']
          .map(name => `export * from ${JSON.stringify(name)}`).join('\n'),
        resolveDir: root, sourcefile: 'client-total.js',
      } } : { entryPoints: [resolve(source, `${entry.path}.${extension}`)] }),
      bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
      minify: true, treeShaking: true, write: false, metafile: true, alias,
      plugins: entry.features ? [featureSwapPlugin(entry.features, extension)] : [],
      define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
    })
    assert(!result.warnings.some(warning => warning.id === 'ignored-bare-import'), `${entry.name}: feature registration was removed`)
    const inputs = Object.keys(result.metafile.inputs).map(path => path.replaceAll('\\', '/'))
    for (const [feature, enabled] of Object.entries(entry.features || {})) {
      if (!enabled) assert(!inputs.some(path => path.endsWith(`/features/${featureDirectories[feature]}/full.${extension}`)), `${entry.name}: disabled ${feature} remains bundled`)
    }
    const bytes = result.outputFiles[0].contents
    rows.push({ name: entry.name, tree, min: bytes.length, gz: gzipSync(bytes).length, br: brotliCompressSync(bytes).length })
  }
  return rows
}

#!/usr/bin/env node
// Rough size measurement: bundle each public entry with esbuild, gzip, report.
import { build } from 'esbuild'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const entries = [
  { name: 'redact', path: 'packages/redact/src/react/index.ts' },
  { name: 'redact/jsx-runtime', path: 'packages/redact/src/react/jsx-runtime.ts' },
  { name: 'redact/dom', path: 'packages/redact/src/dom/index.ts' },
  { name: 'redact/dom-client', path: 'packages/redact/src/dom/client.ts' },
  { name: 'redact/server', path: 'packages/redact/src/server/index.ts' },
  {
    name: 'client total (redact + redact/dom-client + jsx-runtime)',
    virtual: true,
    bundleCode: `
      export * from '@tanstack/redact'
      export * from '@tanstack/redact/jsx-runtime'
      export * from '@tanstack/redact/dom'
      export * from '@tanstack/redact/dom-client'
    `,
  },
  // Demo: simulate what the vite plugin does when features are flagged off.
  // Each entry reuses an upstream entry but swaps the listed features to
  // their stub modules, showing the byte savings the plugin delivers.
  {
    name: 'redact/dom-client  (portal=stub)',
    path: 'packages/redact/src/dom/client.ts',
    features: { portal: false },
  },
  {
    name: 'redact/dom-client  (context=stub)',
    path: 'packages/redact/src/dom/client.ts',
    features: { context: false },
  },
  {
    name: 'redact/dom-client  (suspense=stub)',
    path: 'packages/redact/src/dom/client.ts',
    features: { suspense: false },
  },
  {
    name: 'redact/dom-client  (memo=stub)',
    path: 'packages/redact/src/dom/client.ts',
    features: { memo: false },
  },
  {
    name: 'redact/dom-client  (forwardRef=stub)',
    path: 'packages/redact/src/dom/client.ts',
    features: { forwardRef: false },
  },
  {
    name: 'redact/dom-client  (lazy=stub)',
    path: 'packages/redact/src/dom/client.ts',
    features: { lazy: false },
  },
  {
    name: 'redact/dom-client  (classComponents=stub)',
    path: 'packages/redact/src/dom/client.ts',
    features: { classComponents: false },
  },
  {
    name: 'redact/dom-client  (hydration=stub)',
    path: 'packages/redact/src/dom/client.ts',
    features: { hydration: false },
  },
  {
    name: 'redact/dom-client  (nano preset)',
    path: 'packages/redact/src/dom/client.ts',
    features: {
      portal: false,
      context: false,
      suspense: false,
      memo: false,
      forwardRef: false,
      lazy: false,
      classComponents: false,
      hydration: false,
    },
  },
]

// esbuild plugin: redirect `./<name>` imports in react-dom's features/index
// to the corresponding stub module. Mirrors the resolveId hook in
// @tanstack/dom-vite so size numbers reflect real plugin output.
// Feature names use kebab-case on disk (features/forward-ref/, features/class/)
// but camelCase in the config (`forwardRef: true`, `classComponents: true`).
const FEATURE_DIR_MAP = {
  portal: 'portal',
  context: 'context',
  suspense: 'suspense',
  memo: 'memo',
  forwardRef: 'forward-ref',
  lazy: 'lazy',
  classComponents: 'class',
  hydration: 'hydration',
}

function featureSwapPlugin(features) {
  const dirToKey = Object.fromEntries(
    Object.entries(FEATURE_DIR_MAP).map(([key, dir]) => [dir, key]),
  )
  return {
    name: 'feature-swap',
    setup(build) {
      // Features imported by features/index.ts (the self-registering ones).
      build.onResolve({ filter: /^\.\/[a-z-]+$/ }, (args) => {
        if (!args.importer) return null
        if (!/features[\\/]index\.[jt]sx?$/.test(args.importer)) return null
        const m = args.path.match(/^\.\/([a-z-]+)$/)
        if (!m) return null
        const dir = m[1]
        const key = dirToKey[dir]
        if (key && features[key] === false) {
          return { path: resolve(dirname(args.importer), dir, 'stub.ts') }
        }
        return null
      })
      // Hydration: imported from reconcile/root/suspense/lazy. Match any
      // specifier ending in `/hydration` that resolves to our feature.
      if (features.hydration === false) {
        build.onResolve({ filter: /[/\\]hydration$/ }, (args) => {
          // Resolve manually: walk up from importer's dir based on the prefix
          // in args.path. Only redirects if the resolved path lands in our
          // features/hydration/ directory.
          const m = args.path.match(/^((?:\.\.?[/\\])+)(?:features[/\\])?hydration$/)
          if (!m || !args.importer) return null
          const stub = resolve(
            dirname(args.importer),
            m[1],
            args.path.includes('features/') || args.path.includes('features\\')
              ? 'features/hydration/stub.ts'
              : 'hydration/stub.ts',
          )
          // Match either import style: /features/hydration OR /hydration
          // relative to the /features/... path.
          if (stub.endsWith('/features/hydration/stub.ts') || stub.endsWith('\\features\\hydration\\stub.ts')) {
            return { path: stub }
          }
          // Fall-through: the sibling `../hydration` form from features/*/full.ts
          // resolves into features/hydration/stub.ts via dir walk.
          const sibling = resolve(dirname(args.importer), m[1], 'hydration/stub.ts')
          if (sibling.includes('/features/hydration/') || sibling.includes('\\features\\hydration\\')) {
            return { path: sibling }
          }
          return null
        })
      }
    },
  }
}

const outDir = resolve(root, '.size')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const alias = {
  '@tanstack/redact/jsx-runtime': resolve(root, 'packages/redact/src/react/jsx-runtime.ts'),
  '@tanstack/redact/dom-client': resolve(root, 'packages/redact/src/dom/client.ts'),
  '@tanstack/redact/dom': resolve(root, 'packages/redact/src/dom/index.ts'),
  '@tanstack/redact/server': resolve(root, 'packages/redact/src/server/index.ts'),
  '@tanstack/redact': resolve(root, 'packages/redact/src/react/index.ts'),
}

const rows = []
for (const entry of entries) {
  let entryPoint
  let cleanup = null
  if (entry.virtual) {
    const f = resolve(outDir, `_virt_${entry.name.replace(/[^a-z]/gi, '_')}.js`)
    writeFileSync(f, entry.bundleCode)
    entryPoint = f
    cleanup = f
  } else {
    entryPoint = resolve(root, entry.path)
  }
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    treeShaking: true,
    write: false,
    alias,
    plugins: entry.features ? [featureSwapPlugin(entry.features)] : [],
    // Consumers build with NODE_ENV=production; mirror here so `if (process.env.NODE_ENV !== 'production')`
    // dev-only branches get DCE'd the same way in our size numbers as in shipped bundles.
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
  const bytes = result.outputFiles[0].contents
  const gz = gzipSync(bytes).length
  const br = brotliCompressSync(bytes).length
  rows.push({
    name: entry.name,
    min: bytes.length,
    gz,
    br,
  })
  if (cleanup) rmSync(cleanup, { force: true })
}

const fmt = (n) => {
  if (n < 1024) return n + ' B'
  return (n / 1024).toFixed(2) + ' KB'
}

console.log('\nPackage sizes (minified / gzip / brotli):\n')
const nameWidth = Math.max(...rows.map((r) => r.name.length), 'Entry'.length)
const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length))
console.log(
  `  ${pad('Entry', nameWidth)}  ${'min'.padStart(9)}  ${'gzip'.padStart(9)}  ${'brotli'.padStart(9)}`,
)
console.log(`  ${'-'.repeat(nameWidth)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}`)
for (const r of rows) {
  console.log(
    `  ${pad(r.name, nameWidth)}  ${fmt(r.min).padStart(9)}  ${fmt(r.gz).padStart(9)}  ${fmt(r.br).padStart(9)}`,
  )
}
console.log()
rmSync(outDir, { recursive: true, force: true })

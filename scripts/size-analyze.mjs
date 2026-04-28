#!/usr/bin/env node
// One-off analysis: produce a per-module byte breakdown of the nano bundle.
import { build, analyzeMetafile } from 'esbuild'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const alias = {
  '@tanstack/dom-core': resolve(root, 'packages/core/src/index.ts'),
  '@tanstack/react/jsx-runtime': resolve(root, 'packages/react/src/jsx-runtime.ts'),
  '@tanstack/react': resolve(root, 'packages/react/src/index.ts'),
  '@tanstack/react-dom/client': resolve(root, 'packages/react-dom/src/client.ts'),
  '@tanstack/react-dom': resolve(root, 'packages/react-dom/src/index.ts'),
}

const FEATURE_DIR_MAP = {
  portal: 'portal', context: 'context', suspense: 'suspense', memo: 'memo',
  forwardRef: 'forward-ref', lazy: 'lazy', classComponents: 'class',
}

function featureSwapPlugin(features) {
  const dirToKey = Object.fromEntries(
    Object.entries(FEATURE_DIR_MAP).map(([key, dir]) => [dir, key]),
  )
  return {
    name: 'feature-swap',
    setup(b) {
      b.onResolve({ filter: /^\.\/[a-z-]+$/ }, (args) => {
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
    },
  }
}

const allOff = {
  portal: false, context: false, suspense: false, memo: false,
  forwardRef: false, lazy: false, classComponents: false,
}

const result = await build({
  entryPoints: [resolve(root, 'packages/react-dom/src/client.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  treeShaking: true,
  write: false,
  alias,
  plugins: [featureSwapPlugin(allOff)],
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true,
  logLevel: 'warning',
})

// Analyze uncompressed (minified) contributions per input file. Gzipped
// numbers are roughly proportional but not directly attributable per-file.
const inputs = result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].inputs
const rows = Object.entries(inputs).map(([path, info]) => ({
  path: path.replace(root + '/', '').replace('packages/', ''),
  bytes: info.bytesInOutput,
}))
rows.sort((a, b) => b.bytes - a.bytes)

const total = rows.reduce((s, r) => s + r.bytes, 0)
console.log(`\nNano bundle — minified byte contribution per module (total ${total} B min):\n`)
const w = Math.max(...rows.map((r) => r.path.length))
for (const r of rows) {
  const pct = ((r.bytes / total) * 100).toFixed(1).padStart(5)
  console.log(`  ${r.path.padEnd(w)}  ${String(r.bytes).padStart(6)} B  ${pct}%`)
}
console.log()

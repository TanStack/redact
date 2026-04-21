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
  { name: 'react', path: 'packages/react/src/index.ts' },
  { name: 'react/jsx-runtime', path: 'packages/react/src/jsx-runtime.ts' },
  { name: 'react-dom', path: 'packages/react-dom/src/index.ts' },
  { name: 'react-dom/client', path: 'packages/react-dom/src/client.ts' },
  { name: 'react-dom/server', path: 'packages/react-dom-server/src/index.ts' },
  {
    name: 'client total (react + react-dom/client + jsx-runtime)',
    virtual: true,
    bundleCode: `
      export * from '@tanstack/react'
      export * from '@tanstack/react/jsx-runtime'
      export * from '@tanstack/react-dom'
      export * from '@tanstack/react-dom/client'
    `,
  },
]

const outDir = resolve(root, '.size')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const alias = {
  '@tanstack/dom-core': resolve(root, 'packages/core/src/index.ts'),
  '@tanstack/react/jsx-runtime': resolve(root, 'packages/react/src/jsx-runtime.ts'),
  '@tanstack/react': resolve(root, 'packages/react/src/index.ts'),
  '@tanstack/react-dom/client': resolve(root, 'packages/react-dom/src/client.ts'),
  '@tanstack/react-dom': resolve(root, 'packages/react-dom/src/index.ts'),
  '@tanstack/react-dom-server': resolve(root, 'packages/react-dom-server/src/index.ts'),
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

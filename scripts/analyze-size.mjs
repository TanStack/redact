#!/usr/bin/env node
// Per-file size breakdown + comparison with React 19's bundle layout.
import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const workdir = mkdtempSync(join(tmpdir(), 'tdom-'))

const alias = {
  '@tanstack/dom-core': resolve(root, 'packages/core/src/index.ts'),
  '@tanstack/react/jsx-runtime': resolve(root, 'packages/react/src/jsx-runtime.ts'),
  '@tanstack/react': resolve(root, 'packages/react/src/index.ts'),
  '@tanstack/react-dom/client': resolve(root, 'packages/react-dom/src/client.ts'),
  '@tanstack/react-dom': resolve(root, 'packages/react-dom/src/index.ts'),
  '@tanstack/react-dom-server': resolve(root, 'packages/react-dom-server/src/index.ts'),
}

async function bundle(code, name = 'virt.js') {
  const f = join(workdir, name)
  writeFileSync(f, code)
  const r = await build({
    entryPoints: [f],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    treeShaking: true,
    write: false,
    alias,
    logLevel: 'warning',
    metafile: true,
  })
  const bytes = r.outputFiles[0].contents
  return { bytes, meta: r.metafile }
}

// What portion of final bundle comes from each source file in our tree?
async function analyzeByInput(entryCode) {
  const { bytes, meta } = await bundle(entryCode, 'main.js')
  const gz = gzipSync(bytes).length

  // Inputs in the generated bundle
  const output = Object.values(meta.outputs)[0]
  const inputs = output.inputs
  const rows = []
  let totalIn = 0
  for (const [path, info] of Object.entries(inputs)) {
    totalIn += info.bytesInOutput
    const short = path.startsWith('packages/')
      ? path
      : relative(root, resolve(root, path))
    rows.push({ file: short, min: info.bytesInOutput })
  }
  rows.sort((a, b) => b.min - a.min)
  return { total: bytes.length, totalIn, gz, rows }
}

const entry = `
export * from '@tanstack/react'
export * from '@tanstack/react/jsx-runtime'
export * from '@tanstack/react-dom'
export * from '@tanstack/react-dom/client'
`

const { total, totalIn, gz, rows } = await analyzeByInput(entry)
console.log(`\n=== tanstack-dom client bundle composition ===`)
console.log(`Final minified: ${total} B, gzip: ${gz} B\n`)
console.log(
  `  ${'File'.padEnd(55)}  ${'min B'.padStart(8)}  ${'% total'.padStart(8)}`,
)
console.log(`  ${'-'.repeat(55)}  ${'-'.repeat(8)}  ${'-'.repeat(8)}`)
for (const r of rows) {
  const pct = ((r.min / totalIn) * 100).toFixed(1) + '%'
  console.log(`  ${r.file.padEnd(55)}  ${String(r.min).padStart(8)}  ${pct.padStart(8)}`)
}

// React 19 reference sizes (from npm install react@19.2.3 react-dom@19.2.3)
console.log(`\n=== React 19.2.3 reference (from node_modules) ===`)
const R19 = '/Users/tannerlinsley/GitHub/router/node_modules/.pnpm'
const reactCjs = `${R19}/react@19.2.3/node_modules/react/cjs/react.production.js`
const reactJsxRuntimeCjs = `${R19}/react@19.2.3/node_modules/react/cjs/react-jsx-runtime.production.js`
const reactDomCjs = `${R19}/react-dom@19.2.3_react@19.2.3/node_modules/react-dom/cjs/react-dom.production.js`
const reactDomClientCjs = `${R19}/react-dom@19.2.3_react@19.2.3/node_modules/react-dom/cjs/react-dom-client.production.js`
const reactDomServerCjs = `${R19}/react-dom@19.2.3_react@19.2.3/node_modules/react-dom/cjs/react-dom-server.browser.production.js`
const scheduler = null

function statSize(p) {
  try {
    const raw = readFileSync(p)
    return { min: raw.length, gz: gzipSync(raw).length }
  } catch {
    return null
  }
}

const compare = [
  ['react', reactCjs, 'packages/react'],
  ['react/jsx-runtime', reactJsxRuntimeCjs, 'jsx-runtime'],
  ['react-dom', reactDomCjs, 'packages/react-dom (index)'],
  ['react-dom/client', reactDomClientCjs, 'packages/react-dom/client'],
  ['react-dom/server', reactDomServerCjs, 'packages/react-dom-server'],
]

console.log(
  `  ${'Package'.padEnd(22)}  ${'React 19 gz'.padStart(12)}  ${'tdom gz'.padStart(10)}  ${'ratio'.padStart(8)}`,
)
console.log(`  ${'-'.repeat(22)}  ${'-'.repeat(12)}  ${'-'.repeat(10)}  ${'-'.repeat(8)}`)

async function bundleOne(code) {
  const { bytes } = await bundle(code, 'e.js')
  return { min: bytes.length, gz: gzipSync(bytes).length }
}

for (const [name, p] of compare) {
  const r = statSize(p)
  let ours = null
  if (name === 'react') ours = await bundleOne(`export * from '@tanstack/react'`)
  else if (name === 'react/jsx-runtime')
    ours = await bundleOne(`export * from '@tanstack/react/jsx-runtime'`)
  else if (name === 'react-dom') ours = await bundleOne(`export * from '@tanstack/react-dom'`)
  else if (name === 'react-dom/client') ours = await bundleOne(`export * from '@tanstack/react-dom/client'`)
  else if (name === 'react-dom/server') ours = await bundleOne(`export * from '@tanstack/react-dom-server'`)
  if (!r) continue
  const ratio = ours ? ((ours.gz / r.gz) * 100).toFixed(0) + '%' : 'n/a'
  console.log(
    `  ${name.padEnd(22)}  ${(r.gz + ' B').padStart(12)}  ${((ours?.gz ?? 0) + ' B').padStart(10)}  ${ratio.padStart(8)}`,
  )
}
console.log()

rmSync(workdir, { recursive: true, force: true })

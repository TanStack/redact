#!/usr/bin/env node
// Fair comparison: bundle React 19 the same way we bundle our shim.
import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const R19 = '/Users/tannerlinsley/GitHub/router/node_modules/.pnpm'
const nodeModules = [
  `${R19}/react@19.2.3/node_modules`,
  `${R19}/react-dom@19.2.3_react@19.2.3/node_modules`,
  `${R19}/scheduler@0.27.0/node_modules`,
]

async function bundleReact(code, label) {
  const dir = mkdtempSync(join(tmpdir(), 'r19-'))
  const f = join(dir, 'e.js')
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
    define: {
      'process.env.NODE_ENV': '"production"',
      __DEV__: 'false',
    },
    nodePaths: nodeModules,
    logLevel: 'silent',
  })
  rmSync(dir, { recursive: true, force: true })
  const bytes = r.outputFiles[0].contents
  return { label, min: bytes.length, gz: gzipSync(bytes).length }
}

const configs = [
  ['react (full)', `import * as R from 'react'; globalThis._ = R`],
  ['react/jsx-runtime', `import * as R from 'react/jsx-runtime'; globalThis._ = R`],
  ['react-dom (full)', `import * as R from 'react-dom'; globalThis._ = R`],
  ['react-dom/client', `import * as R from 'react-dom/client'; globalThis._ = R`],
  ['react-dom/server', `import * as R from 'react-dom/server'; globalThis._ = R`],
  [
    'client total (react+dom/client+jsx-runtime)',
    `
      import * as A from 'react'
      import * as B from 'react-dom'
      import * as C from 'react-dom/client'
      import * as D from 'react/jsx-runtime'
      globalThis._ = [A, B, C, D]
    `,
  ],
]

console.log(`\n=== React 19.2.3 — real tree-shaken + minified + gzipped ===\n`)
console.log(`  ${'Entry'.padEnd(46)}  ${'min'.padStart(10)}  ${'gzip'.padStart(10)}`)
console.log(`  ${'-'.repeat(46)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}`)
for (const [label, code] of configs) {
  const r = await bundleReact(code, label)
  console.log(
    `  ${r.label.padEnd(46)}  ${(r.min + ' B').padStart(10)}  ${(r.gz + ' B').padStart(10)}`,
  )
}
console.log()

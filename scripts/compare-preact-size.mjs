import { build, version as esbuildVersion } from 'esbuild'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { measureSizes } from './measure-size.mjs'

// Download an exact Preact release outside the workspace, then pass its unpacked
// package directory. This does not change the application's dependencies.
const packageRoot = resolve(process.argv[2] || 'tests/node_modules/preact')
const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
const rows = []
for (const [name, entries] of [
  ['Preact core', ['preact']],
  ['Preact core + hooks + JSX', ['preact', 'preact/hooks', 'preact/jsx-runtime']],
  ['Preact compat + JSX + client', ['preact/compat', 'preact/jsx-runtime', 'preact/compat/client']],
]) {
  const result = await build({
    stdin: { contents: entries.map(entry => `export * from ${JSON.stringify(entry)}`).join('\n'), resolveDir: process.cwd() },
    alias: { preact: packageRoot }, bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    minify: true, treeShaking: true, write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const bytes = result.outputFiles[0].contents
  rows.push({ name, min: bytes.length, gz: gzipSync(bytes).length, br: brotliCompressSync(bytes).length })
}
console.log(JSON.stringify({
  redactRevision: process.env.REDACT_REVISION || 'working-tree', preactVersion: pkg.version, node: process.version, esbuild: esbuildVersion,
  method: 'Production browser ESM, es2022, all entry exports retained; bytes, not kB. Redact source tree specified by SIZE_PACKAGE_ROOT; see redactRevision. Server, debug tools and signals excluded.',
  preact: rows,
  redact: (await measureSizes('src')).filter(row => ['client total (default Vite)', 'client total', 'redact/dom-client (nano)'].includes(row.name)),
}, null, 2))

import assert from 'node:assert/strict'
import { build, version as esbuildVersion } from 'esbuild'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { measureSizes } from './measure-size.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const packageRoot = resolve(process.env.SIZE_PACKAGE_ROOT || resolve(root, 'packages/redact'))
const hash = value => createHash('sha256').update(value).digest('hex')
const manifest = tree => readdirSync(resolve(packageRoot, tree), { recursive: true })
  .filter(file => /\.(?:ts|js|map)$/.test(file)).sort()
  .map(file => ({ file, sha256: hash(readFileSync(resolve(packageRoot, tree, file))) }))
const reference = createRequire(resolve(root, 'benchmarks/reference/package.json'))
const pinned = JSON.parse(readFileSync(resolve(root, 'benchmarks/reference/package.json'))).dependencies
for (const name of ['react', 'react-dom']) assert.equal(reference(name + '/package.json').version, pinned[name])
const clientEntries = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']
const clientContents = clientEntries.map(name => `export * from ${JSON.stringify(name)}`).join('\n')
const result = await build({
  stdin: {
    contents: clientContents,
    resolveDir: root, sourcefile: 'client-total.js',
  },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  minify: true, treeShaking: true, write: false, metafile: true,
  alias: Object.fromEntries(clientEntries.map(name => [name, reference.resolve(name)])),
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
})
const bytes = result.outputFiles[0].contents
const data = {
  date: new Date().toISOString(), node: process.version, esbuild: esbuildVersion,
  method: 'Production es2022 ESM, all entry exports retained, default gzip and brotli. Feature variants assert that disabled full implementations are absent. Not an application bundle.',
  packageRoot,
  sourceFiles: manifest('src'), builtFiles: manifest('dist'),
  redact: { source: await measureSizes('src'), built: await measureSizes('dist') },
  react: {
    version: pinned.react, entry: 'client total', min: bytes.length,
    gz: gzipSync(bytes).length, br: brotliCompressSync(bytes).length,
    bundleSHA256: hash(bytes),
    inputs: Object.keys(result.metafile.inputs).sort().map(path => path === 'client-total.js'
      ? { path, virtual: true, sha256: hash(clientContents) }
      : { path, sha256: hash(readFileSync(resolve(root, path))) }),
  },
}
const output = resolve(process.env.OUTPUT || resolve(root, 'benchmarks/results/ship-sizes.json'))
writeFileSync(output, JSON.stringify(data, null, 2) + '\n')
console.log(JSON.stringify({ output, react: data.react.gz, redact: data.redact.built.map(({ name, gz }) => ({ name, gz })) }, null, 2))

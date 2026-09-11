import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const sources = process.argv.slice(2)
if (!sources.length) throw Error('Pass one or more source directories')
for (const source of sources) {
  for (const entry of ['dom/client.ts', 'dom/index.ts', 'react/index.ts', 'server/index.ts']) {
    const result = await build({
      entryPoints: [resolve(source, entry)], bundle: true, format: 'esm', platform: 'browser',
      target: 'es2022', minify: true, treeShaking: true, write: false,
      define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
    })
    const bytes = result.outputFiles[0].contents
    console.log(JSON.stringify({ source, entry, minified: bytes.length, gzip: gzipSync(bytes).length }))
  }
}

import { compatibilitySizeAllowance } from './compatibility-size-budget.mjs'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { build } from 'vite'
import { transform } from 'esbuild'
import { redact } from '../packages/redact/dist/vite/index.js'

const current = resolve('packages/redact')
const root = mkdtempSync(resolve(tmpdir(), 'redact-react-size-'))
mkdirSync(resolve(root, 'node_modules/react'), { recursive: true })
const rows = []
try {
  let baselineRevision
  let baseline = process.env.REACT_SIZE_BASELINE
  if (!baseline) {
    const base = process.env.REACT_SIZE_BASE_REF || 'origin/main'
    baselineRevision = execFileSync('git', ['rev-parse', base], { encoding: 'utf8' }).trim()
    const checkout = resolve(root, 'baseline')
    mkdirSync(checkout)
    const archive = execFileSync('git', ['archive', base, 'packages/redact'], { maxBuffer: 128 * 1024 * 1024 })
    execFileSync('tar', ['-x', '-C', checkout], { input: archive })
    symlinkSync(resolve('node_modules'), resolve(checkout, 'node_modules'), 'dir')
    baseline = resolve(checkout, 'packages/redact')
    symlinkSync(resolve('packages/redact/node_modules'), resolve(baseline, 'node_modules'), 'dir')
    execFileSync(process.execPath, ['scripts/build.mjs'], { env: { ...process.env, BUILD_PACKAGE_ROOT: baseline }, stdio: 'inherit' })
    console.log(`Size baseline: ${execFileSync('git', ['rev-parse', base], { encoding: 'utf8' }).trim()}`)
  }
  // Compare the same React protocol and public version on both sides. Different
  // version strings alone can change compressed bytes without a code regression.
  for (const profile of ['full', 'default', 'nano']) {
    for (const entry of ['react/index', 'react/jsx-runtime', 'dom/index', 'dom/client', 'server/index', 'client-total']) {
      const references = new Map()
      for (const [label, pkg, version] of [['baseline19', baseline, '19.3.1'], ['baseline18', baseline, '18.3.1'], ['react19', current, '19.3.1'], ['react18', current, '18.3.1']]) {
        writeFileSync(resolve(root, 'node_modules/react/package.json'), JSON.stringify({ version }))
        let entryPath = resolve(pkg, `dist/${entry}.js`)
        if (entry === 'client-total') {
          entryPath = resolve(root, 'client-total.js')
          writeFileSync(entryPath, ['react/index', 'react/jsx-runtime', 'dom/index', 'dom/client']
            .map(path => `export * from ${JSON.stringify(resolve(pkg, `dist/${path}.js`))};`).join('\n'))
        }
        const output = await build({
          root, configFile: false, logLevel: 'silent',
          plugins: redact({ resolveFrom: root, packageRoots: { '@tanstack/redact': pkg },
            preset: profile === 'nano' ? 'nano' : 'full', features: { viewTransitions: profile === 'full' } }),
          define: { 'process.env.NODE_ENV': JSON.stringify('production') },
          build: { write: false, minify: true, lib: { entry: entryPath, formats: ['es'], fileName: 'size' } },
        })
        const bundled = [output].flat().flatMap(bundle => bundle.output).filter(file => file.type === 'chunk').map(file => file.code).join('')
        // Vite preserves whitespace for ES library output. Compare the final
        // minified output, using the same minifier for every target.
        const { code } = await transform(bundled, { minify: true, format: 'esm', target: 'es2022' })
        const sizes = { min: Buffer.byteLength(code), gzip: gzipSync(code).length, brotli: brotliCompressSync(code).length }
        if (label.startsWith('baseline')) references.set(version, sizes)
        else {
          const reference = references.get(version)
          rows.push({ profile, entry, target: label, ...Object.fromEntries(Object.keys(sizes).map(key => [key, sizes[key] - reference[key]])) })
        }
      }
    }
  }
  console.table(rows)
  for (const row of rows) for (const metric of ['min', 'gzip', 'brotli']) {
    const allowance = compatibilitySizeAllowance(baselineRevision, row, metric)
    assert(row[metric] <= allowance, `${row.target} ${row.profile} ${row.entry}: ${metric} grew by ${row[metric]} bytes, approved allowance ${allowance}`)
  }
} finally {
  rmSync(root, { recursive: true, force: true })
}

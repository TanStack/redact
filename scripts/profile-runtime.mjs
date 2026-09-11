// Diagnostic CPU profiles, not comparative timing results.
// SOURCE=/path/to/src WORKLOADS=hydration,mount-unmount node scripts/profile-runtime.mjs
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = resolve(process.env.SOURCE || 'packages/redact/src')
const output = resolve(process.env.OUTPUT || '/tmp/redact-profiles')
const names = (process.env.WORKLOADS || 'hydration,mount-unmount').split(',')
const iterations = Number(process.env.ITERATIONS || 1000)
if (!Number.isInteger(iterations) || iterations < 1) throw new Error('Invalid ITERATIONS')
const paths = Object.fromEntries(Object.entries({
  react: 'react/index.ts', 'react/jsx-runtime': 'react/jsx-runtime.ts',
  'react-dom': 'dom/index.ts', 'react-dom/client': 'dom/client.ts',
  'react-dom/server': 'server/index.ts',
}).map(([name, path]) => [name, resolve(source, path)]))
const built = await build({
  entryPoints: [resolve(root, 'benchmarks/runtime-workloads.ts')],
  bundle: true, write: false, metafile: true, platform: 'browser', format: 'iife',
  target: 'es2022', minifyWhitespace: true, minifySyntax: true,
  // Keep names readable. This diagnostic build is not the fully minified benchmark.
  minifyIdentifiers: false, tsconfigRaw: { compilerOptions: {} },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'renderer', setup(b) {
    b.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => {
      if (!paths[args.path]) throw new Error(`Unmapped import ${args.path}`)
      return { path: paths[args.path] }
    })
  } }],
})
mkdirSync(output, { recursive: true })
const bundle = built.outputFiles[0].text
writeFileSync(resolve(output, 'bundle.js'), bundle)
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify({
  source, iterations, names,
  method: 'Production readable-name diagnostic bundle. Profile includes fixture setup, validation and teardown, not only its timed section. Sampled CPU stacks are attribution hints, not a speedup claim.',
  inputs: Object.keys(built.metafile.inputs).sort().map(path => ({
    path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
  })),
}, null, 2))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const name of names) {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body></body></html>')
    await page.addScriptTag({ content: bundle + '\n//# sourceURL=redact-profile.js' })
    const run = count => page.evaluate(({ name, count }) => window.__runtimeBench.run(name, count), { name, count })
    for (let warm = 0; warm < 3; warm++) await run(Math.min(iterations, 100))
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
    await cdp.send('Profiler.start')
    const checked = await run(iterations)
    const { profile } = await cdp.send('Profiler.stop')
    writeFileSync(resolve(output, `${name}.cpuprofile`), JSON.stringify(profile))
    const nodes = new Map(profile.nodes.map(node => [node.id, node]))
    const weights = new Map()
    for (let i = 0; i < (profile.samples?.length || 0); i++) {
      const frame = nodes.get(profile.samples[i]).callFrame
      const label = frame.functionName || '(anonymous)'
      weights.set(label, (weights.get(label) || 0) + profile.timeDeltas[i])
    }
    console.log(name, checked)
    console.table([...weights].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, us]) => ({ name, sampledMs: us / 1000 })))
    await page.close()
  }
} finally {
  await browser.close()
}

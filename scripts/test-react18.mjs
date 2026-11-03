import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { build } from 'vite'
import { chromium } from 'playwright'
import { redact } from '../packages/redact/dist/vite/index.js'

// Install an actual consumer, not aliases whose ReactDOM silently uses React 19.
const root = mkdtempSync(resolve(tmpdir(), 'redact-react18-'))
const version = process.env.REACT_VERSION || '18.3.1'
execFileSync('pnpm', ['--dir', 'packages/redact', 'pack', '--pack-destination', root], { stdio: 'pipe' })
const packageVersion = JSON.parse(readFileSync('packages/redact/package.json')).version
writeFileSync(resolve(root, 'package.json'), JSON.stringify({ name: 'react18-consumer', private: true, type: 'module', dependencies: {
  react: version, 'react-dom': version, 'react-is': version,
  '@tanstack/redact': `file:./tanstack-redact-${packageVersion}.tgz`,
} }))
execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' })
cpSync(new URL('../tests/fixtures/react18/entry.js', import.meta.url), resolve(root, 'entry.js'))
const browser = await chromium.launch({ headless: true })
try {
  const results = {}
  for (const mode of ['development', 'production']) {
    for (const runtime of ['react', 'redact']) {
      const output = await build({
        root, configFile: false, logLevel: 'warn',
        plugins: runtime === 'redact' ? redact({ resolveFrom: root, packageRoots: { '@tanstack/redact': resolve(root, 'node_modules/@tanstack/redact') } }) : [],
        build: {
          write: false, minify: true,
          lib: { entry: resolve(root, 'entry.js'), formats: ['iife'], name: 'React18Check' },
          rollupOptions: { onwarn(warning, warn) {
            if (warning.code === 'INVALID_ANNOTATION') throw new Error(warning.message)
            warn(warning)
          } },
        },
        define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
      })
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.setContent('<div id="root"></div><div id="portal"></div>')
      await page.addScriptTag({ content: [output].flat().flatMap(bundle => bundle.output).find(file => file.type === 'chunk').code })
      results[runtime] = await page.evaluate(() => globalThis.react18Result)
      assert.deepEqual(errors, [], `${runtime}: browser errors`)
      await page.close()
      console.log(`${mode} ${runtime}: ${Object.keys(results[runtime]).length} checks`)
    }
    assert.deepEqual(results.redact, results.react)
    console.log(`React ${version}: all consumer checks match`)
  }
} finally {
  await browser.close()
  rmSync(root, { recursive: true, force: true })
}

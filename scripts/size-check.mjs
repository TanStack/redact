#!/usr/bin/env node
// Size budgets. Fails CI if any entry exceeds its gzip budget. Regenerate the
// baseline by running `node scripts/size.mjs`, copying the gzip column, and
// bumping the budget intentionally — size regressions should require a
// conscious choice, not slip through.
import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// gzip-byte budgets per named configuration. Update intentionally — size
// regressions should require a conscious choice, not slip through CI.
// Current sizes (May 2026): 2716 / 9305 / 6934 / 8649 / 8002. Budgets include
// a small cushion over current (~60 B) to absorb minor noise. Shrink budgets
// when you intentionally make the bundle smaller.
const BUDGETS = {
  'redact': 2780,
  'redact/dom-client': 9370,
  'redact/dom-client (nano)': 7000,
  'redact/dom-client (suspense=stub)': 8710,
  'redact/dom-client (hydration=stub)': 8060,
}

const alias = {
  '@tanstack/redact/jsx-runtime': resolve(root, 'packages/redact/src/react/jsx-runtime.ts'),
  '@tanstack/redact/dom-client': resolve(root, 'packages/redact/src/dom/client.ts'),
  '@tanstack/redact/dom': resolve(root, 'packages/redact/src/dom/index.ts'),
  '@tanstack/redact/server': resolve(root, 'packages/redact/src/server/index.ts'),
  '@tanstack/redact': resolve(root, 'packages/redact/src/react/index.ts'),
}

const FEATURE_DIR_MAP = {
  portal: 'portal',
  context: 'context',
  suspense: 'suspense',
  memo: 'memo',
  forwardRef: 'forward-ref',
  lazy: 'lazy',
  classComponents: 'class',
  hydration: 'hydration',
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
      if (features.hydration === false) {
        b.onResolve({ filter: /[/\\]hydration$/ }, (args) => {
          const m = args.path.match(/^((?:\.\.?[/\\])+)(?:features[/\\])?hydration$/)
          if (!m || !args.importer) return null
          const wantsFeaturesPrefix = /features[/\\]/.test(args.path)
          const tail = wantsFeaturesPrefix ? 'features/hydration/stub.ts' : 'hydration/stub.ts'
          const candidate = resolve(dirname(args.importer), m[1], tail)
          if (/[/\\]features[/\\]hydration[/\\]stub\.ts$/.test(candidate)) {
            return { path: candidate }
          }
          return null
        })
      }
    },
  }
}

const outDir = resolve(root, '.size-check')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const entries = [
  { name: 'redact', path: 'packages/redact/src/react/index.ts' },
  { name: 'redact/dom-client', path: 'packages/redact/src/dom/client.ts' },
  {
    name: 'redact/dom-client (nano)',
    path: 'packages/redact/src/dom/client.ts',
    features: {
      portal: false, context: false, suspense: false, memo: false,
      forwardRef: false, lazy: false, classComponents: false, hydration: false,
    },
  },
  {
    name: 'redact/dom-client (suspense=stub)',
    path: 'packages/redact/src/dom/client.ts',
    features: { suspense: false },
  },
  {
    name: 'redact/dom-client (hydration=stub)',
    path: 'packages/redact/src/dom/client.ts',
    features: { hydration: false },
  },
]

let failed = false
for (const entry of entries) {
  const result = await build({
    entryPoints: [resolve(root, entry.path)],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    treeShaking: true,
    write: false,
    alias,
    plugins: entry.features ? [featureSwapPlugin(entry.features)] : [],
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
  const gz = gzipSync(result.outputFiles[0].contents).length
  const budget = BUDGETS[entry.name]
  if (budget == null) {
    console.log(`  ?  ${entry.name}: ${gz} B gzip  (no budget)`)
    continue
  }
  const over = gz - budget
  if (over > 0) {
    console.log(`  ✗  ${entry.name}: ${gz} B gzip  (over budget by ${over} B, budget ${budget})`)
    failed = true
  } else {
    console.log(`  ✓  ${entry.name}: ${gz} B gzip  (${-over} B under budget ${budget})`)
  }
}

rmSync(outDir, { recursive: true, force: true })

if (failed) {
  console.log('\nSize budget exceeded. Regenerate baselines in BUDGETS if the growth is intentional.\n')
  process.exit(1)
}
console.log('\nAll size budgets satisfied.\n')

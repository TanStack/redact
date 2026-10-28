#!/usr/bin/env node
import { measureSizes } from './measure-size.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const nodeVersion = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim()
assert.equal(process.versions.node, nodeVersion, `Size checks use Node ${nodeVersion} from .nvmrc so gzip measurements stay comparable. Run nvm use before pnpm size:check.`)
console.log(`Size toolchain: Node ${process.versions.node}, zlib ${process.versions.zlib}`)

// Base limits retain the pre-integration client totals and initial feature limits.
// Keep the built package under test, source-only checks missed baked-in dev code.
const BUDGETS = {
  'redact': 2793,
  'redact/jsx-runtime': 217,
  'redact/dom': 25543,
  'redact/dom-client': 25270,
  'redact/server': 8989,
  'client total': 28183,
  'client total (default Vite)': 23335,
  'redact/dom-client (activity=stub)': 24728,
  'redact/dom-client (fragmentRefs=stub)': 23091,
  'redact/dom-client (viewTransitions=stub)': 20434,
  'redact/dom-client (portal=stub)': 25235,
  'redact/dom-client (context=stub)': 24991,
  'redact/dom-client (suspense=stub)': 23752,
  'redact/dom-client (memo=stub)': 25175,
  'redact/dom-client (forwardRef=stub)': 25230,
  'redact/dom-client (lazy=stub)': 25266,
  'redact/dom-client (classComponents=stub)': 24803,
  'redact/dom-client (hydration=stub)': 22583,
  'redact/dom-client (nano)': 12652,
}


// User-approved persistent transition queue cost, [source, built] gzip bytes.
// Only this measured increment is allowed for individual entries. Both client
// totals keep their original hard limits now that the shared runtime fits again.
// Evidence: benchmarks/results/rd-queue-implementation/matched-{base,node}-size.txt
const QUEUE_SIZE_ALLOWANCE = {
  'redact/dom': [23, 13],
  'redact/dom-client': [15, 14],
  'redact/dom-client (activity=stub)': [14, 12],
  'redact/dom-client (fragmentRefs=stub)': [14, 9],
  'redact/dom-client (viewTransitions=stub)': [17, 18],
  'redact/dom-client (portal=stub)': [12, 12],
  'redact/dom-client (context=stub)': [12, 12],
  'redact/dom-client (memo=stub)': [13, 13],
  'redact/dom-client (forwardRef=stub)': [14, 14],
  'redact/dom-client (lazy=stub)': [14, 13],
  'redact/dom-client (classComponents=stub)': [14, 12],
  'redact/dom-client (hydration=stub)': [18, 18],
}

// Measured cost of mapping camelCase SVG presentation props to their hyphenated
// attribute names (shapeRendering, fontSize, stopColor, ...), [source, built]
// gzip bytes. React applies the same table; without it the browser ignores the
// attributes. The prefix pattern lives in src/core/attributes.ts.
const SVG_ATTRIBUTE_ALLOWANCE = {
  'redact/dom': [169, 178],
  'redact/dom-client': [178, 175],
  'redact/server': [172, 170],
  'client total': [172, 178],
  'client total (default Vite)': [222, 203],
  'redact/dom-client (activity=stub)': [175, 171],
  'redact/dom-client (fragmentRefs=stub)': [176, 179],
  'redact/dom-client (viewTransitions=stub)': [181, 182],
  'redact/dom-client (portal=stub)': [179, 174],
  'redact/dom-client (context=stub)': [177, 173],
  'redact/dom-client (suspense=stub)': [195, 198],
  'redact/dom-client (memo=stub)': [169, 176],
  'redact/dom-client (forwardRef=stub)': [177, 175],
  'redact/dom-client (lazy=stub)': [175, 173],
  'redact/dom-client (classComponents=stub)': [174, 175],
  'redact/dom-client (hydration=stub)': [191, 191],
  'redact/dom-client (nano)': [180, 185],
}

let failed = false
for (const tree of ['src', 'dist']) {
  for (const row of await measureSizes(tree)) {
    const baseBudget = BUDGETS[row.name]
    const budget = baseBudget === undefined ? undefined : baseBudget + (QUEUE_SIZE_ALLOWANCE[row.name]?.[tree === 'src' ? 0 : 1] ?? 0) + (SVG_ATTRIBUTE_ALLOWANCE[row.name]?.[tree === 'src' ? 0 : 1] ?? 0)
    const ok = budget !== undefined && row.gz <= budget
    failed ||= !ok
    console.log(`${ok ? 'PASS' : 'FAIL'} ${tree} ${row.name}: ${row.gz} B gzip, budget ${budget ?? 'missing'}`)
  }
}
if (failed) {
  console.error('\nSize budget exceeded or missing. Review the measured cost before changing a budget.')
  process.exitCode = 1
} else console.log('\nAll source and built-package size budgets passed.')

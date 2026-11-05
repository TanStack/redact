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

// Approved root-transition correctness cost on main 20f6dd6, [source, built].
// Only entries exceeding existing limits receive their measured increment.
const ROOT_TRANSITION_SIZE_ALLOWANCE = {
  'client total (default Vite)': [132, 111],
  'redact/dom-client (viewTransitions=stub)': [97, 81],
}

// Approved combined store/hydration correctness cost on main 89f2bfc.
const STORE_HYDRATION_SIZE_ALLOWANCE = {
  'redact/dom-client (hydration=stub)': [3, 0],
}

// Measured pending-range deletion correctness cost, [source, built] gzip bytes.
const PENDING_RANGE_SIZE_ALLOWANCE = {
  'redact/dom-client (hydration=stub)': [35, 42],
  'redact/server': [16, 15],
}

let failed = false
for (const tree of ['src', 'dist']) {
  for (const row of await measureSizes(tree)) {
    const baseBudget = BUDGETS[row.name]
    const budget = baseBudget === undefined ? undefined : baseBudget + (PENDING_RANGE_SIZE_ALLOWANCE[row.name]?.[tree === 'src' ? 0 : 1] ?? 0) + (STORE_HYDRATION_SIZE_ALLOWANCE[row.name]?.[tree === 'src' ? 0 : 1] ?? 0) + (ROOT_TRANSITION_SIZE_ALLOWANCE[row.name]?.[tree === 'src' ? 0 : 1] ?? 0) + (QUEUE_SIZE_ALLOWANCE[row.name]?.[tree === 'src' ? 0 : 1] ?? 0)
    const ok = budget !== undefined && row.gz <= budget
    failed ||= !ok
    console.log(`${ok ? 'PASS' : 'FAIL'} ${tree} ${row.name}: ${row.gz} B gzip, budget ${budget ?? 'missing'}`)
  }
}
if (failed) {
  console.error('\nSize budget exceeded or missing. Review the measured cost before changing a budget.')
  process.exitCode = 1
} else console.log('\nAll source and built-package size budgets passed.')

#!/usr/bin/env node
import { measureSizes } from './measure-size.mjs'

// These are intentional release budgets, not a claim that the expanded API
// surface is smaller than the previous release. See benchmarks/SHIP_RESULTS.md.
// Keep the built package under test, source-only checks missed baked-in dev code.
const BUDGETS = {
  'redact': 2793,
  'redact/jsx-runtime': 217,
  'redact/dom': 25246,
  'redact/dom-client': 25006,
  'redact/server': 8989,
  'client total': 28183,
  'client total (default Vite)': 23335,
  'redact/dom-client (activity=stub)': 24438,
  'redact/dom-client (fragmentRefs=stub)': 22814,
  'redact/dom-client (viewTransitions=stub)': 20159,
  'redact/dom-client (portal=stub)': 24972,
  'redact/dom-client (context=stub)': 24719,
  'redact/dom-client (suspense=stub)': 23479,
  'redact/dom-client (memo=stub)': 24912,
  'redact/dom-client (forwardRef=stub)': 24973,
  'redact/dom-client (lazy=stub)': 24983,
  'redact/dom-client (classComponents=stub)': 24512,
  'redact/dom-client (hydration=stub)': 22400,
  'redact/dom-client (nano)': 12491,
}

let failed = false
for (const tree of ['src', 'dist']) {
  for (const row of await measureSizes(tree)) {
    const budget = BUDGETS[row.name]
    const ok = budget !== undefined && row.gz <= budget
    failed ||= !ok
    console.log(`${ok ? 'PASS' : 'FAIL'} ${tree} ${row.name}: ${row.gz} B gzip, budget ${budget ?? 'missing'}`)
  }
}
if (failed) {
  console.error('\nSize budget exceeded or missing. Review the measured cost before changing a budget.')
  process.exitCode = 1
} else console.log('\nAll source and built-package size budgets passed.')

#!/usr/bin/env node
import { measureSizes } from './measure-size.mjs'

// These are intentional release budgets, not a claim that the expanded API
// surface is smaller than the previous release. See benchmarks/SHIP_RESULTS.md.
// Keep the built package under test, source-only checks missed baked-in dev code.
const BUDGETS = {
  'redact': 2793,
  'redact/jsx-runtime': 217,
  // Hydration and Suspense correctness costs are measured against pristine main.
  // Only exceeded limits changed, with no added margin.
  // See benchmarks/HYDRATION_SUSPENSE_RECOVERY.md for the complete comparison.
  'redact/dom': 25977,
  'redact/dom-client': 25494,
  'redact/server': 9336,
  'client total': 28668,
  'client total (default Vite)': 23814,
  'redact/dom-client (activity=stub)': 24939,
  'redact/dom-client (fragmentRefs=stub)': 23305,
  'redact/dom-client (viewTransitions=stub)': 20674,
  'redact/dom-client (portal=stub)': 25462,
  'redact/dom-client (context=stub)': 25214,
  'redact/dom-client (suspense=stub)': 23942,
  'redact/dom-client (memo=stub)': 25400,
  'redact/dom-client (forwardRef=stub)': 25445,
  'redact/dom-client (lazy=stub)': 25482,
  'redact/dom-client (classComponents=stub)': 24891,
  'redact/dom-client (hydration=stub)': 23036,
  'redact/dom-client (nano)': 12920,
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

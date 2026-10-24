#!/usr/bin/env node
import { measureSizes } from './measure-size.mjs'

// These are intentional release budgets, not a claim that the expanded API
// surface is smaller than the previous release. See benchmarks/SHIP_RESULTS.md.
// Keep the built package under test, source-only checks missed baked-in dev code.
const BUDGETS = {
  'redact': 2793,
  'redact/jsx-runtime': 217,
  // Direct URL comparison adds 120 gzip bytes to DOM and 134 to DOM-client
  // versus upstream main. Budgets cover the measured source and built entries.
  'redact/dom': 25372,
  'redact/dom-client': 25028,
  'redact/server': 8989,
  'client total': 28187,
  'client total (default Vite)': 23335,
  'redact/dom-client (activity=stub)': 24467,
  'redact/dom-client (fragmentRefs=stub)': 22839,
  'redact/dom-client (viewTransitions=stub)': 20198,
  'redact/dom-client (portal=stub)': 24996,
  'redact/dom-client (context=stub)': 24739,
  'redact/dom-client (suspense=stub)': 23505,
  'redact/dom-client (memo=stub)': 24931,
  'redact/dom-client (forwardRef=stub)': 24990,
  'redact/dom-client (lazy=stub)': 25020,
  'redact/dom-client (classComponents=stub)': 24547,
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

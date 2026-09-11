#!/usr/bin/env node
import { measureSizes } from './measure-size.mjs'

const tree = process.env.SIZE_TREE || 'dist'
const rows = await measureSizes(tree)
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.log(`\nProduction package sizes from ${tree}, in bytes:\n`)
  console.table(rows.map(({ name, min, gz, br }) => ({ entry: name, minified: min, gzip: gz, brotli: br })))
  console.log('The default Vite preset uses viewTransitions=stub. Native animations are opt-in.\n')
}

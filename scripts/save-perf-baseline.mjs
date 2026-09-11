// Save a reproducible source baseline for prepare-perf-baseline.mjs.
// Usage: node scripts/save-perf-baseline.mjs /path/to/src benchmarks/name.patch
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const [source, output] = process.argv.slice(2)
assert(source && output, 'Pass a source directory and output patch path')
const published = resolve('benchmarks/reference/node_modules/@tanstack/redact')
const packageA = JSON.parse(readFileSync(join(published, 'package.json')))
const packageB = JSON.parse(readFileSync(join(dirname(resolve(source)), 'package.json')))
assert.equal(packageA.version, '0.0.20')
assert.deepEqual(packageA, packageB, 'Baseline package metadata must match the pinned package')
for (const key of ['exports', 'imports']) assert.equal(JSON.stringify(packageA[key]), JSON.stringify(packageB[key]))
const temporary = mkdtempSync(join(tmpdir(), 'redact-save-baseline-'))
try {
  cpSync(join(published, 'src'), join(temporary, 'a'), { recursive: true })
  cpSync(resolve(source), join(temporary, 'b'), { recursive: true })
  const result = spawnSync('git', ['diff', '--no-index', '--no-prefix', '--', 'a', 'b'], {
    cwd: temporary, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  })
  assert(result.status === 0 || result.status === 1, result.stderr || 'Source diff failed')
  writeFileSync(resolve(output), result.stdout)
  console.log(resolve(output))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

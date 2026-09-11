// Rebuild the exact pre-performance source from the pinned published package.
// Prints a source directory suitable for EXTRA_SOURCE in compare-runtime.mjs.
import { cpSync, readFileSync, mkdtempSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const published = resolve(root, 'benchmarks/reference/node_modules/@tanstack/redact')
if (JSON.parse(readFileSync(resolve(published, 'package.json'))).version !== '0.0.20') {
  throw new Error('Install the locked benchmark reference first')
}
const directory = mkdtempSync(join(tmpdir(), 'redact-pre-performance-'))
cpSync(resolve(published, 'src'), resolve(directory, 'src'), { recursive: true })
cpSync(resolve(published, 'package.json'), resolve(directory, 'package.json'))
const patched = spawnSync('patch', ['-p1', '--batch'], {
  cwd: resolve(directory, 'src'), encoding: 'utf8',
  input: readFileSync(resolve(root, process.env.BASELINE_PATCH || 'benchmarks/pre-performance.patch')),
})
if (patched.status !== 0) throw new Error(patched.stdout + patched.stderr)
console.log(resolve(directory, 'src'))

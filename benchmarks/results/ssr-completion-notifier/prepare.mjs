import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const fixtures = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(fixtures, '../../..')
const output = process.env.RD_ROOT
if (!output || fs.existsSync(output)) throw new Error('Set RD_ROOT to a new output directory')
const baseline = '37c051c9'
const prefix = 'packages/redact/src/'
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, prefix], { cwd: repo, encoding: 'utf8' }).trim().split('\n')
for (const file of files) {
  const target = path.join(output, 'base/src', file.slice(prefix.length))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, execFileSync('git', ['show', `${baseline}:${file}`], { cwd: repo }))
}
fs.cpSync(path.join(repo, prefix), path.join(output, 'notifier-reuse/src'), { recursive: true })
for (const file of ['staggered-workload.ts', 'nested-workload.ts', 'notifier-semantics.ts', 'completed-retention.ts', 'rope-workload.ts']) {
  fs.copyFileSync(path.join(fixtures, file), path.join(output, file))
}

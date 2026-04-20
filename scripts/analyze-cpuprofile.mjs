#!/usr/bin/env node
// Aggregates a .cpuprofile into a top-N self-time table.
//
// Usage: node scripts/analyze-cpuprofile.mjs /tmp/shim.cpuprofile [limit]
import { readFileSync } from 'node:fs'

const [, , path, limitArg] = process.argv
if (!path) {
  console.error('usage: analyze-cpuprofile.mjs <path> [limit]')
  process.exit(1)
}
const limit = Number(limitArg ?? 30)
const prof = JSON.parse(readFileSync(path, 'utf8'))

// Build id → node map and self-time per node (via samples + timeDeltas).
const nodeById = new Map()
for (const n of prof.nodes) nodeById.set(n.id, n)

const selfById = new Map()
const { samples, timeDeltas } = prof
for (let i = 0; i < samples.length; i++) {
  const id = samples[i]
  const dt = timeDeltas[i] ?? 0
  selfById.set(id, (selfById.get(id) ?? 0) + dt)
}

// Aggregate by callFrame (functionName + url:line).
const byFrame = new Map()
for (const [id, self] of selfById) {
  const n = nodeById.get(id)
  const cf = n.callFrame
  const key = `${cf.functionName || '(anonymous)'}  @  ${prettyUrl(cf.url)}:${cf.lineNumber}`
  const r = byFrame.get(key) ?? { self: 0, hits: 0 }
  r.self += self
  r.hits += n.hitCount ?? 0
  byFrame.set(key, r)
}

const total = [...selfById.values()].reduce((a, b) => a + b, 0)
const rows = [...byFrame.entries()]
  .map(([key, r]) => ({ key, self: r.self, hits: r.hits, pct: (100 * r.self) / total }))
  .sort((a, b) => b.self - a.self)

console.log(
  `Total sampled time: ${(total / 1000).toFixed(1)}ms across ${samples.length} samples\n`,
)
console.log(
  `${'self (ms)'.padStart(10)}  ${'pct'.padStart(6)}  frame`,
)
console.log('-'.repeat(100))
for (const r of rows.slice(0, limit)) {
  console.log(`${(r.self / 1000).toFixed(2).padStart(10)}  ${r.pct.toFixed(2).padStart(5)}%  ${r.key}`)
}

function prettyUrl(url) {
  if (!url) return '<native>'
  return url
    .replace('file:///Users/tannerlinsley/GitHub/tanstack-react/.claude/worktrees/sleepy-mendel-dc5a50/', 'shim/')
    .replace('file:///Users/tannerlinsley/GitHub/router/', 'router/')
    .replace(/^.*node_modules\/\.pnpm\/([^/]+)\/node_modules\//, 'npm/$1/')
    .replace(/^.*node_modules\//, 'node_modules/')
}

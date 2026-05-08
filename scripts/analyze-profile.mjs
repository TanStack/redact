// Aggregate a Chrome CPU profile by self time and (rolled-up) total time.
// Usage: node scripts/analyze-profile.mjs /tmp/redact-browser.cpuprofile [topN]
import { readFileSync } from 'node:fs'

const path = process.argv[2]
const topN = Number(process.argv[3] ?? 40)
if (!path) {
  console.error('usage: node scripts/analyze-profile.mjs <profile.cpuprofile> [topN]')
  process.exit(1)
}

const prof = JSON.parse(readFileSync(path, 'utf8'))
const nodes = prof.nodes
const samples = prof.samples
const deltas = prof.timeDeltas

const byId = new Map(nodes.map((n) => [n.id, n]))
const selfUs = new Map()
for (let i = 0; i < samples.length; i += 1) {
  const id = samples[i]
  selfUs.set(id, (selfUs.get(id) || 0) + deltas[i])
}

// Build parent map for total-time roll-up
const parentOf = new Map()
for (const n of nodes) {
  if (n.children) for (const c of n.children) parentOf.set(c, n.id)
}

// Total time = self + sum of descendants' self
const totalUs = new Map()
function rollUp(id) {
  if (totalUs.has(id)) return totalUs.get(id)
  const n = byId.get(id)
  let t = selfUs.get(id) || 0
  if (n.children) {
    for (const c of n.children) t += rollUp(c)
  }
  totalUs.set(id, t)
  return t
}
for (const n of nodes) rollUp(n.id)

const totalSampled = [...selfUs.values()].reduce((a, b) => a + b, 0)
const isMeta = (n) => n.callFrame.functionName === '(idle)' || n.callFrame.functionName === '(program)' || n.callFrame.functionName === '(garbage collector)'
const nonIdle = [...selfUs.entries()]
  .filter(([id]) => !isMeta(byId.get(id)))
  .reduce((s, [, t]) => s + t, 0)

function fmt(n) {
  const fn = n.callFrame
  const url = (fn.url || '').replace(/^https?:\/\/[^/]+/, '')
  const head = fn.functionName || '(anon)'
  return `${head}  @${url}:${fn.lineNumber}`
}

const bySelf = [...selfUs.entries()]
  .map(([id, t]) => ({ id, n: byId.get(id), self: t, total: totalUs.get(id) || 0 }))
  .filter((x) => x.n)
  .sort((a, b) => b.self - a.self)

console.log(`Profile: ${path}`)
console.log(`Total sampled: ${(totalSampled / 1000).toFixed(1)}ms`)
console.log(`Non-idle/program/GC: ${(nonIdle / 1000).toFixed(1)}ms`)
console.log(`\nTop ${topN} by SELF time (% of non-idle):`)
let i = 0
for (const x of bySelf) {
  if (isMeta(x.n)) continue
  if (i++ >= topN) break
  const pct = (x.self / nonIdle * 100).toFixed(1)
  const totPct = (x.total / nonIdle * 100).toFixed(1)
  console.log(
    `  self=${pct.padStart(5)}%  tot=${totPct.padStart(5)}%  ${(x.self / 1000).toFixed(1).padStart(7)}ms  ${fmt(x.n)}`,
  )
}

// Aggregate self/total time per FUNCTION NAME (not call-site), so the
// fragmented entries from minified profiles roll up to one row per function.
import { readFileSync } from 'node:fs'

function aggregate(path) {
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
  // Roll up by name+url
  const byName = new Map()
  for (const [id, t] of selfUs) {
    const n = byId.get(id)
    const fn = n.callFrame
    const key = (fn.functionName || '(anon)') + '|' + (fn.url || '')
    const cur = byName.get(key) || { name: fn.functionName || '(anon)', url: fn.url || '', self: 0 }
    cur.self += t
    byName.set(key, cur)
  }
  const total = [...selfUs.values()].reduce((a, b) => a + b, 0)
  const isMeta = (n) =>
    n === '(idle)' || n === '(program)' || n === '(garbage collector)' || n === '(root)'
  const nonIdle = [...byName.values()].filter((x) => !isMeta(x.name)).reduce((s, x) => s + x.self, 0)
  return { total, nonIdle, rows: [...byName.values()].sort((a, b) => b.self - a.self) }
}

const a = aggregate(process.argv[2])
const b = aggregate(process.argv[3])
const labelA = process.argv[4] || 'A'
const labelB = process.argv[5] || 'B'

console.log(`${labelA}: total=${(a.total / 1000).toFixed(1)}ms  non-idle=${(a.nonIdle / 1000).toFixed(1)}ms`)
console.log(`${labelB}: total=${(b.total / 1000).toFixed(1)}ms  non-idle=${(b.nonIdle / 1000).toFixed(1)}ms`)
console.log()

console.log(`Top 25 by self time — ${labelA}:`)
for (const r of a.rows.slice(0, 25)) {
  if (r.name.startsWith('(')) continue
  const pct = ((r.self / a.nonIdle) * 100).toFixed(1)
  const url = r.url.replace(/^https?:\/\/[^/]+/, '')
  console.log(`  ${pct.padStart(5)}%  ${(r.self / 1000).toFixed(1).padStart(7)}ms  ${r.name}  @${url}`)
}

console.log(`\nTop 25 by self time — ${labelB}:`)
for (const r of b.rows.slice(0, 25)) {
  if (r.name.startsWith('(')) continue
  const pct = ((r.self / b.nonIdle) * 100).toFixed(1)
  const url = r.url.replace(/^https?:\/\/[^/]+/, '')
  console.log(`  ${pct.padStart(5)}%  ${(r.self / 1000).toFixed(1).padStart(7)}ms  ${r.name}  @${url}`)
}

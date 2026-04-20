#!/usr/bin/env node
// Drives N SSR requests against the router bench's shim-built handler so a
// Node CPU profile captures hot frames.
//
// Usage:
//   USE_SHIM=1 pnpm --filter @benchmarks/ssr build:react   # build the shim-based bundle
//   node --cpu-prof --cpu-prof-name=shim.cpuprofile --cpu-prof-dir=/tmp scripts/prof-ssr.mjs
//
// Then inspect /tmp/shim.cpuprofile with scripts/analyze-cpuprofile.mjs.
const HANDLER = '/Users/tannerlinsley/GitHub/router/benchmarks/ssr/react/dist/server/server.js'
const N = Number(process.env.N ?? 3000)
const WARMUP = Number(process.env.WARMUP ?? 200)

const mod = await import(HANDLER)
const handler = mod.default

function randomUrl(seed) {
  let s = seed >>> 0
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0)
  const seg = () => Math.floor((next() / 0x100000000) * 1e9).toString(36)
  const a = seg()
  const b = seg()
  const c = seg()
  const d = seg()
  const q = `q-${seg()}`
  return `http://localhost/${a}/${b}/${c}/${d}?q=${q}`
}

async function hit(i) {
  const res = await handler.fetch(
    new Request(randomUrl(i ^ 0xdecafbad), {
      method: 'GET',
      headers: { accept: 'text/html' },
    }),
  )
  if (res.status !== 200) throw new Error(`status ${res.status}`)
  await res.text()
}

// Warmup — let JIT stabilize before the profiler window matters.
for (let i = 0; i < WARMUP; i++) await hit(i)

const t0 = Date.now()
for (let i = WARMUP; i < WARMUP + N; i++) await hit(i)
const dt = Date.now() - t0

console.log(
  `${N} reqs in ${dt}ms (${(dt / N).toFixed(3)}ms/req, ${((1000 * N) / dt).toFixed(1)} req/s)`,
)

#!/usr/bin/env node
// Buckets a .cpuprofile into categories (shim reconciler, shim server,
// router-core, router-react, store, node runtime, react-created garbage)
// so we can see where total time actually goes.
import { readFileSync } from 'node:fs'

const [, , path] = process.argv
if (!path) { console.error('usage: bucket-cpuprofile.mjs <path>'); process.exit(1) }
const prof = JSON.parse(readFileSync(path, 'utf8'))
const nodeById = new Map()
for (const n of prof.nodes) nodeById.set(n.id, n)

const selfById = new Map()
for (let i = 0; i < prof.samples.length; i++) {
  selfById.set(prof.samples[i], (selfById.get(prof.samples[i]) ?? 0) + (prof.timeDeltas[i] ?? 0))
}

// Coarse bucketing by callFrame URL + function name.
function bucket(cf) {
  const fn = cf.functionName || '(anonymous)'
  const url = cf.url || ''
  if (!url) return 'native/runtime'
  if (url.includes('node:internal')) return 'node/async+streams'
  if (url.includes('/router-core/') || /^(stringifyValue|getMatchedRoutes|matchRoutes|interpolatePath|encodePathParam|decodePath|cleanPath|build|RouterCore)/.test(fn)) return 'router-core'
  if (url.includes('/react-router/') || /useLinkProps|MatchImpl|MatchInnerImpl|Link/.test(fn)) return 'router-react'
  if (url.includes('/react-store/') || url.includes('useStore') || /useStore/.test(fn)) return 'router-react'
  if (url.includes('/packages/react-dom-server/')) return 'shim: ssr walk/stream'
  if (url.includes('/packages/react-dom/')) return 'shim: client reconcile (ssr dispatcher?)'
  if (url.includes('/packages/core/')) return 'shim: core types'
  if (url.includes('/packages/react/')) return 'shim: react (hooks/memo)'
  if (url.includes('/tanstack-react/.claude/') || url.includes('/packages/')) return 'shim: misc'
  // Bundled server.js has no distinct URL for inlined shim code; infer by fn name.
  if (/^(walk|walkElement|walkNode|walkHost|walkComponent|walkSuspense|walkLazy|walkForwardRef|walkMemo|renderToString|renderToStream|writeChunk|escape)/.test(fn)) return 'shim: ssr walk/stream'
  if (/^(jsx|jsxs|createElement|Fragment|memo|forwardRef)/.test(fn)) return 'shim: react (hooks/memo)'
  if (/^(useState|useReducer|useEffect|useLayoutEffect|useMemo|useCallback|useRef|useContext|useSyncExternalStore)/.test(fn)) return 'shim: react (hooks/memo)'
  if (url.includes('router/benchmarks')) return 'app code (bench)'
  if (url.includes('node_modules')) return 'other deps'
  return `other: ${url}`
}

const buckets = new Map()
for (const [id, self] of selfById) {
  const n = nodeById.get(id)
  const b = bucket(n.callFrame)
  const r = buckets.get(b) ?? { self: 0, count: 0 }
  r.self += self
  r.count++
  buckets.set(b, r)
}

const total = [...selfById.values()].reduce((a, b) => a + b, 0)
const rows = [...buckets.entries()]
  .map(([b, r]) => ({ b, self: r.self, pct: (100 * r.self) / total, count: r.count }))
  .sort((a, b) => b.self - a.self)

console.log(`Total sampled time: ${(total / 1000).toFixed(1)}ms across ${prof.samples.length} samples\n`)
console.log(`${'self (ms)'.padStart(10)}  ${'pct'.padStart(6)}  bucket`)
console.log('-'.repeat(80))
for (const r of rows) {
  console.log(`${(r.self / 1000).toFixed(2).padStart(10)}  ${r.pct.toFixed(2).padStart(5)}%  ${r.b}`)
}

#!/usr/bin/env node
// Reproduces a latent TanStack Router bug that the shim exposes because it
// renders faster than React's default.
//
// The router's `loadedAt` store is set to `Date.now()` after each navigation.
// When two consecutive navigations complete within the same millisecond — easy
// to hit with a fast renderer like ours — the store's `Object.is` equality
// check rejects the `.set()` call, `propagate` is skipped, and subscribers
// (notably `MatchesInner` → `Match` → `OnRendered`) never re-render. The
// `onRendered` event never emits and any code awaiting it hangs forever.
//
// Real React (~27ms/nav) effectively never collides with 1ms resolution.
// Our shim (~3ms/nav) collides after some number of iterations.
//
// Usage:
//   # Rebuild the router client-nav bench against the shim first:
//   USE_SHIM=1 pnpm --filter @benchmarks/client-nav build:react
//
//   # Reproduce the hang (default):
//   node scripts/repro-router-hang.mjs
//
//   # Apply the monotonic-loadedAt workaround to confirm it's the root cause:
//   FIX=1 node scripts/repro-router-hang.mjs
//
// NOTE: requires the router bench to have been built with shim src aliases
// (add USE_SHIM-gated `resolve.alias` in benchmarks/client-nav/react/vite.config.ts
// pointing at this repo's packages/*/src/*.ts).
const { JSDOM } = await import(
  '/Users/tannerlinsley/GitHub/tanstack-react/.claude/worktrees/sleepy-mendel-dc5a50/node_modules/.pnpm/jsdom@25.0.1/node_modules/jsdom/lib/api.js'
)

const BENCH_DIST = '/Users/tannerlinsley/GitHub/router/benchmarks/client-nav/react/dist/app.js'
const MAX_TICKS = Number(process.env.MAX_TICKS ?? 2000)
const APPLY_FIX = process.env.FIX === '1'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.self = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Element = dom.window.Element
globalThis.Node = dom.window.Node
globalThis.Event = dom.window.Event
globalThis.MouseEvent = dom.window.MouseEvent
globalThis.CustomEvent = dom.window.CustomEvent
globalThis.location = dom.window.location
globalThis.history = dom.window.history
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.scrollTo = () => {}

const mod = await import(BENCH_DIST)

const container = document.createElement('div')
document.body.appendChild(container)
const { router, unmount } = mod.mountTestApp(container)
await router.load()

if (APPLY_FIX) {
  // Monotonic counter in place of Date.now() — ensures every nav produces a
  // unique loadedAt so subscribers always get notified.
  let mono = router.stores.loadedAt.get() + 1
  const origSet = router.stores.loadedAt.set.bind(router.stores.loadedAt)
  router.stores.loadedAt.set = () => origSet(mono++)
  console.log('[FIX applied] loadedAt uses monotonic counter instead of Date.now()')
}

for (let i = 0; i < 20 && !container.querySelector('[data-testid="go-items-1"]'); i++) {
  await new Promise((r) => setTimeout(r, 10))
}

const waitRendered = () =>
  new Promise((resolve) => {
    const un = router.subscribe('onRendered', () => {
      un()
      resolve()
    })
  })

const click = async (testId) => {
  const p = waitRendered()
  const el = container.querySelector(`[data-testid="${testId}"]`)
  if (!el) throw new Error(`missing [data-testid="${testId}"]`)
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  await p
}

const navigate = async (opts) => {
  const p = waitRendered()
  router.navigate(opts)
  await p
}

// Same 10-step cycle the router's client-nav bench runs.
const steps = [
  { name: 'click go-items-1', fn: () => click('go-items-1') },
  { name: 'click items-details', fn: () => click('items-details') },
  { name: 'nav /items/$id/details id=2', fn: () => navigate({ to: '/items/$id/details', params: { id: 2 }, replace: true }) },
  { name: 'click items-parent', fn: () => click('items-parent') },
  { name: 'click go-search', fn: () => click('go-search') },
  { name: 'click search-next-page', fn: () => click('search-next-page') },
  { name: 'nav /search page=1', fn: () => navigate({ to: '/search', search: { page: 1, filter: 'all' }, replace: true }) },
  { name: 'click go-ctx', fn: () => click('go-ctx') },
  { name: 'nav /ctx/$id id=2', fn: () => navigate({ to: '/ctx/$id', params: { id: 2 }, replace: true }) },
  { name: 'click go-items-2', fn: () => click('go-items-2') },
]

const t0 = Date.now()
for (let tickN = 1; tickN <= MAX_TICKS; tickN++) {
  const step = steps[(tickN - 1) % steps.length]
  const loadedAtBefore = router.stores.loadedAt.get()
  const hangTimer = setTimeout(() => {
    const loadedAtAfter = router.stores.loadedAt.get()
    console.log(`\nHANG at tick ${tickN}: "${step.name}" did not fire onRendered after 2s`)
    console.log(`  route: ${router.state?.location?.href}`)
    console.log(`  loadedAt: ${loadedAtBefore} → ${loadedAtAfter} (changed=${loadedAtBefore !== loadedAtAfter})`)
    console.log(`  ran ${tickN - 1} ticks successfully in ${Date.now() - t0}ms (${((Date.now() - t0) / (tickN - 1)).toFixed(2)}ms/tick)`)
    console.log(`  → loadedAt stayed at same value, so subscribers (MatchesInner) never notified,`)
    console.log(`    OnRendered's useLayoutEffect never enqueued, and onRendered never fired.`)
    process.exit(2)
  }, 2000)
  try {
    await step.fn()
  } catch (err) {
    clearTimeout(hangTimer)
    console.log(`\nERROR at tick ${tickN} (${step.name}):`, err)
    process.exit(1)
  }
  clearTimeout(hangTimer)
  if (tickN % 500 === 0) console.log(`  ... ${tickN} ticks OK (${Date.now() - t0}ms)`)
}

const total = Date.now() - t0
console.log(
  `\nDONE: ${MAX_TICKS} ticks in ${total}ms (${(total / MAX_TICKS).toFixed(2)}ms/tick, ${((1000 * MAX_TICKS) / total).toFixed(1)} ticks/s)`,
)
unmount()
process.exit(0)

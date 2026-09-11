# React 19.3 APIs with synchronous rendering

For the stabilized implementation, use the [ship review](../benchmarks/SHIP_RESULTS.md). It includes the final browser and real-site checks, build verification, sizes, and performance comparisons. The dated measurements below remain historical.

The measurements below describe the completed API pass before the [native ViewTransition experiment](./VIEW_TRANSITION_EXPERIMENT.md). That follow-up adds a synchronous render/commit split and fixes the original native snapshot failures. Animation remains off by default in Vite. Its direct DOM entrypoints, core commit behavior and size costs differ from the historical baseline below, so use the experiment notes for current evidence.

The later [parity expansion](../benchmarks/PARITY_EXPANSION.md) adds real resource APIs, retained Suspense lifecycle parity, reducer retry correctness, browser-enforced Trusted Types/nonce coverage, and native image/font waits. It also records substantial update-time and bundle-size regressions, so the historical passing budgets below do not describe the current experiment.

The default Vite plugin enables the new APIs. Redact still uses synchronous rendering and its existing action, optimistic-state, deferred-value and transition downgrades.

| API | Redact behavior |
|---|---|
| `Activity` | Hidden content retains DOM and state. Layout/passive effects, refs, class mount lifecycles and external-store subscriptions disconnect while hidden and reconnect on reveal. Insertion effects stay connected. Hidden prerendering and updates run synchronously, not at background priority. |
| Fragment refs | Stable instances support events, focus, layout, DOM position/root queries, observers and scrolling. Membership follows child changes, portals and Activity visibility. Callback cleanup runs before the Fragment's DOM is removed. |
| `ViewTransition` | A distinct, state-preserving rendering boundary. No browser snapshots, animations, transition styles or animation callbacks. This is the explicit synchronous downgrade, not visual-transition parity. |
| `addTransitionType` | Accepts transition types without changing scheduling or starting animations. |
| `browser(reason?)` | `use(browser())` returns `undefined` on the client. During DOM server rendering it requests the nearest Suspense fallback for client rendering. Hydration recovers that boundary without reporting an ordinary mismatch. Reasons are evaluated on the server, not in the browser. |
| `onBrowserBailout` | Reports intentional server-to-client deferral separately from `onError`, with an error and component stack. Supported by stream options, including browser-token abort reasons. |
| `cacheSignal` | Returns `null`, matching React's client entrypoint and DOM-server usage. The plugin continues to leave the RSC environment on real React, which owns Server Component cache lifetimes. |
| `unstable_useCacheRefresh` | Returns a stable no-op for the uncached client runtime. A refresh obtained during server rendering throws if called. This does not add a client cache or replace upstream RSC cache refresh behavior. |

The default ViewTransition downgrade keeps commits synchronous. The opt-in experiment prepares the next tree synchronously, then applies its DOM changes in the browser's snapshot callback. This adds browser-coordinated animation without a concurrent renderer, but animated commits necessarily wait for that callback. [React ViewTransition reference](https://react.dev/reference/react/ViewTransition). The cache distinction follows the [client-only return behavior of cacheSignal](https://react.dev/reference/react/cacheSignal).

`Activity` and Fragment refs have independent feature flags:

```ts
redact({ features: { activity: false, fragmentRefs: false } })
```

Disabling Activity unmounts hidden children and remounts fresh state on reveal. Disabling Fragment refs removes instance behavior. Both are enabled by default and disabled in the explicit `nano` preset. Bundle-graph tests check that peer imports do not pull disabled implementations back in.

The implementation also fixes lazy state initializers running again on updates, premature removal of suspended component DOM, callback-ref reconnection order and stream shell/cancellation settlement. These fixes are covered separately from the deliberate scheduling downgrades.

## Size and verification

Standalone minified entrypoints, gzip bytes:

| Configuration | Before these APIs | With these APIs |
|---|---:|---:|
| Full client | 11,588 | 15,269 |
| Nano client | 7,666 | 8,396 |
| React entrypoint | 2,567 | 2,733 |
| Server entrypoint | 5,442 | 6,410 |
| Client with Activity stripped | n/a | 14,601 |
| Client with Fragment refs stripped | n/a | 13,248 |

The full client grows 3,681 bytes, about 31.8%. Fragment refs account for 2,021 removable bytes and Activity for 668 when stripped separately; those savings are not additive because features share code. Nano grows 730 bytes, about 9.5%. These are standalone entrypoint sizes, not an application's total bundle. Size budgets were updated deliberately and now also check both new feature flags.

The complete suite passes 1,226 tests across 70 files. Types, production build, size budgets and benchmark-statistics tests pass. Shared API cases run against Redact and pinned React 19.3:

| Cases | jsdom, each renderer | Chrome, each renderer |
|---|---:|---:|
| Activity behavior | 25 | 25 |
| Activity hydration | 4 | 4 |
| Fragment refs | 23 | 23 |
| Browser bailout APIs | 23 | 20 |
| ViewTransition and cache surface | 7 | 7 |
| Ref and layout commit ordering | 10 | 10 |

Three pipeable-stream cases run in Node/jsdom rather than Chrome. Redact additionally passes the hidden-server to visible-client Activity hydration case in both environments. Pinned React 19.3 exhausts the bounded heap in the isolated jsdom reproduction; the Chrome probe was inconclusive. Only that case is excluded from reference runs, and it is not counted as a parity pass. Reproduce it with `node scripts/repro-activity-hydration-reference.mjs`.

Redact-only tests verify synchronous transition/Activity behavior, ViewTransition server output without animation metadata and the explicit Activity stub. The Vite suite has 19 cases, including eight feature-flag combinations checking that disabled implementations stay out of generated bundles.

Commit ordering now follows the shared React cases: insertion effects before refs/layout, child-first host refs and layout effects, Fragment refs before their descendants, and class refs after mount lifecycles. Three earlier placement tests depended on render-phase object ref assignment, which React does not do. They now test external DOM moves before a later reconciliation instead. A separate shared test preserves user DOM moves made during ref commit.

## Runtime cost

The full comparison measures 16 existing workloads, trusted clicks and retained memory with all APIs enabled, before the final commit-queue guard. The focused comparison adds that 56-byte guard and repeats eight workloads against the same API-complete source, pre-API Redact, React and an identical React control. Each run uses five fresh Chrome blocks and five timed rounds on Apple M5 Pro. These workloads measure the cost of carrying the APIs, not the speed of their new operations.

The guard skips commit-map lookups for descendants without staged work. It reduces stable keyed-row time by 6.8%, automatic-JSX keyed rows by 7.8%, deep-tree updates by 6.9% and controlled-select updates by 6.2%, relative to the same API implementation without the guard. Eight internal tests cover stack cleanup after errors, unmounts, root discard and out-of-order flushes.

Final source compared with pre-API Redact, positive means more time:

| Workload | Time change | 95% interval |
|---|---:|---:|
| Stable keyed rows | +1.4% | +0.7% to +1.5% |
| Automatic-JSX keyed rows | +1.2% | +0.9% to +2.6% |
| Deep-tree updates | +3.0% | +2.4% to +4.1% |
| Controlled selects | +2.6% | +2.1% to +3.0% |
| Mount/unmount | +1.4% | +0.9% to +2.3% |
| Hydration | +0.8% | -1.0% to +3.9% |
| Passive effects | -1.3% | -3.5% to +3.1% |
| Batched setters | +0.5% | -1.0% to +1.0% |

This is a small remaining runtime cost, not a free API expansion or an across-the-board speedup. The focused comparison still puts Redact 32.9% behind React on mount/unmount and 11.8% behind on hydration, while batched setters take 25.5% less time and deep-tree updates take 34.1% less. The full pre-guard run's click-duration medians are 16 ms for every renderer at Chrome's reporting granularity; its final unmounts leave no extra DOM nodes. The final guard was not remeasured for clicks, memory or the other eight workloads.

Intervals are exploratory and not adjusted for multiple comparisons. These results do not measure either real site, field INP or mobile hardware. [Full measurements](../benchmarks/NEW_APIS_RESULTS.md), [reproduction](../benchmarks/README.md), [independent audit](../benchmarks/NEW_APIS_AUDIT.md).

These historical additions did not establish complete React parity. The later [parity expansion](../benchmarks/PARITY_EXPANSION.md) implements resource hints and tests Trusted Types enforcement and nonce hydration. It documents the remaining gaps and costs separately.

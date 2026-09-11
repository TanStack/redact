# React parity expansion

This is the historical expansion snapshot, before stabilization. The [ship review](./SHIP_RESULTS.md) records the later fixes, recovered performance, accepted size budgets, and final verification. Numbers and the verdict below belong to this earlier snapshot.

This pass fixes the reducer, retained Suspense, resource, error-reporting, and browser security gaps left after the [commit-error pass](./COMMIT_ERROR_PARITY.md). The reference is pinned React 19.3.0. Scheduling remains synchronous, native animation remains opt-in in Vite, and the existing action, optimistic-state, and deferred-value downgrades are unchanged.

Nothing has been published. Size budgets still fail and have not been raised. This is tested compatibility work, not a claim of complete React parity.

Verdict: keep the compatibility fixes and regression tests, but do not ship this combined implementation yet. The measured size and update-time costs are too large for Redact's size-and-speed priorities.

## Behavior

- Reducer actions use the reducer selected by the successful render, including changed props and Suspense retries. Render-phase updates settle before DOM, refs, and effects commit. Equal-value `useState` updates keep their eager bailout.
- A child state update that suspends activates its boundary and preserves the last committed primary DOM. Suspense disconnects layout effects, refs, and class lifecycles while keeping passive effects, insertion effects, and store subscriptions connected. Activity and Suspense share retained-effect bookkeeping without duplicate cleanup.
- The six resource-hint APIs create, reuse, and deduplicate real resources. Declarative stylesheets, grouped inline styles, and async scripts share that registry. Resource refs and ownership follow the pinned renderer's same-fiber behavior, including retaining the original node when a resource URL changes. Abandoned client renders do not execute their scripts.
- Server rendering collects resources per request. Streaming keeps external CSS dependencies boundary-specific, allows unrelated boundaries to reveal, preserves precedence, and handles failed or nonmatching stylesheets. Inline rules follow React's precedence-group flushing. Failed render attempts can preload CSS without activating their own inline rules.
- Streaming accepts a script nonce string or separate `{ script, style }` nonces. Managed inline rules must match the configured style nonce. Bootstrap, reveal, abort, and resource attributes escape nonce and URL values. The synchronous server renderers do not adopt unsupported nonce options.
- Trusted HTML survives hydration probes, including table, SVG, and iframe `srcDoc` paths. Nonce hydration reads the nonce property and avoids rewriting a matching browser-hidden nonce.
- Caught, uncaught, cleanup, and hydration-retry errors report source component stacks. A throwing root error callback does not become a component lifecycle failure. Fatal-error recovery cannot be overwritten by a later root render.
- Native transitions wait for the eligible image/font cases covered by the shared tests. A failed root no longer discards a healthy root's prepared work. Cancellation and urgent flushing consume surviving prepared commits once.

Resource semantics were checked against the [React preload contract](https://react.dev/reference/react-dom/preload), error callbacks against [createRoot](https://react.dev/reference/react-dom/client/createRoot), and native behavior against [ViewTransition](https://react.dev/reference/react/ViewTransition) plus the installed reference implementation. Native animation still requires the browser's snapshot callback, it does not add concurrent rendering.

## Verification

The ordinary suite passes 1,473 tests, with 89 browser-only skips. Skips are not parity passes. Type checking, the 83-entry production build, three statistics tests, and `git diff --check` pass.

| Focused suite | Redact | React | Environment |
|---|---:|---:|---|
| Reducer, retained Suspense, and completed-work fixtures | 55 | 54 | Chrome |
| Error handling | 32 | 32 | Chrome |
| Native transitions | 60 | 57 | Chrome, normal and reduced motion |
| Image/font readiness | 20 | 20 | Chrome, normal and reduced motion |
| Multi-root native recovery | 6 | 6 | Chrome, normal and reduced motion |
| Resource APIs | 28 | 28 | jsdom |
| Server resources | 38 | 38 | Node |
| Declarative resource ownership and refs | 21 | 21 | jsdom |
| Resource execution and CSS cascade | 8 | 8 | Chrome |
| Trusted Types and nonce hydration | 8 | 8 | Chrome, development and production |
| Streamed CSS with enforced script/style CSP | 3 | 3 | Chrome |
| Streamed nonce escaping | 3 | 3 | Node |

Counts describe each named suite, not a sum of unique tests. Redact additionally passes four collector tests and six Vite resource-entrypoint tests. The latter verify that unused named resource APIs disappear from both Vite presets.

The CSP fixture uses an actual HTTP policy, a named Trusted Types policy, and no permissive default policy. Seven of its eight cases fail on the preceding frozen source. The streamed CSS fixture holds a real stylesheet response and checks fallback visibility, independent boundary reveal, head placement, nonce values, and computed styles.

The reducer benchmarks validate every intermediate row state against committed DOM inside layout callbacks, per-row commit/cleanup counts, action order, hidden primary state, fallback lifecycle, reveal completion, and an independently triggered suspension. Deliberate fixture-corruption tests prove that a correct final DOM cannot hide incorrect intermediate work. This shared instrumentation is included in the timed work. Reported operations count dispatched actions, not renders or commits.

## Size

Standalone minified entrypoints, gzip bytes. The preceding source is the completed commit-error experiment, not the published package.

| Entry | Before this pass | Expanded parity | Change |
|---|---:|---:|---:|
| Full DOM client | 21,087 | 24,459 | +3,372 |
| Native-stripped DOM client | 17,382 | 19,637 | +2,255 |
| Nano DOM client | 9,926 | 11,974 | +2,048 |
| React API | 2,768 | 2,768 | 0 |
| Server | 6,410 | 9,031 | +2,621 |

In-memory size ablations attribute 889, 855, and 859 gzip bytes respectively to declarative resource support in the three client presets. Named hint APIs add zero to those client-only entries. Retaining every DOM export adds about 0.85 KB for the named APIs alongside the shared resource implementation. These costs are not additive, both code and gzip dictionaries are shared. The ablations remove required behavior and are not proposed shipping configurations.

## Runtime

Five fresh Chrome blocks, five timed rounds, identical fixtures, and an identical-React control compare the frozen sources. The ordinary run includes 15 workloads, 480 trusted clicks, and 60 retained-memory cycles. [Full measurements](./PARITY_EXPANSION_RESULTS.md), [raw results](./results/parity-expansion-cpu1.json).

| Workload | Expanded parity vs preceding Redact | 95% block interval |
|---|---:|---:|
| Deep-tree updates | +50.2% | +40.0% to +54.1% |
| Batched setters | +29.0% | +27.8% to +29.4% |
| Sparse setters | +28.2% | +26.7% to +29.3% |
| Passive effects | +26.3% | +24.4% to +30.6% |
| Null siblings | +22.5% | +21.9% to +23.3% |
| Mixed-depth setters | +14.0% | +10.2% to +20.7% |
| Automatic-JSX keyed rows | +4.5% | +3.4% to +5.2% |
| Hydration | +2.0% | +0.6% to +3.8% |
| Mount/unmount | +1.2% | -1.8% to +2.6% |

Positive means more time. The intervals are exploratory, not corrected for multiple comparisons. The identical-React control's median absolute difference is 0.5%, though its deep-tree interval is wide. The large Redact-before/after regressions are not explained by a tiny measurement difference.

Against React, the expanded build is slower on passive effects (+41.7%), hydration (+15.2%), and browser SSR (+7.4%). It remains faster on sparse setters (-65.9%), mixed-depth setters (-54.9%), and keyed reversal (-29.2%). Other results are closer or have wide intervals. This is not an overall renderer score.

The 2,400-row click fixture has a 1.1 ms median handler-to-commit time for both Redact sources, versus 1.4 ms for React. All 480 observed click entries have 16 ms median and p95 duration at Chrome's reporting granularity. Mounted retained JS heap is 764.0 KiB versus 762.2 KiB before this pass and 665.3 KiB for React. Final unmounts leave no additional DOM nodes. These checks do not measure allocation rate or field INP.

The next optimization targets are common render/hook bookkeeping, accumulated effect-queue copies in Suspense checkpoints, and retention work applied outside the affected subtree. Source inspection identifies those costs, but does not establish which one causes each measured regression. Optimizations must retain the new completed-work and parity checks.

The three new completed-work fixtures confirm a larger gap in the newly corrected paths:

| Workload | Expanded parity vs React | 95% block interval |
|---|---:|---:|
| Reducer batches | +17.0% | +16.3% to +18.0% |
| Reducer updates beneath Suspense | +51.3% | +48.2% to +52.7% |
| Reducer suspend/retry cycles | +136.2% | +130.7% to +138.6% |

These use five fresh blocks and five rounds, with a 0.5% median absolute identical-React control difference. The retry case takes about 2.36 times React's time, including the same correctness instrumentation. The previous eager-reducer implementation fails the retry contract and is not a valid baseline for this comparison. [Raw reducer results](./results/parity-expansion-reducers-cpu1.json).

The audit independently recomputed both runs' statistics, verified 1,725 timing samples and 142,650 reported correctness checks, reconstructed both source snapshots, and rebuilt every measured bundle byte-for-byte. See the [measurement audit](./PARITY_EXPANSION_AUDIT.md).

## Limits

Real hidden-tab transition behavior is still unverified in headless Chrome. ShadowRoot resource ownership, server `noscript` resource handling, broader streamed/hydrated Suspense combinations, and all navigation-resource races are not established as compatible by this pass. The earlier pinned-React Activity hydration comparison remains excluded where the reference cannot complete, not counted as a parity pass.

Local fixtures do not establish whole-site speed on tanstack.com or tannerlinsley.com, field INP, cross-device animation smoothness, or memory allocation rate. No concurrent scheduler, priority lanes, or interruptible background rendering were added.

# Final Chrome parity gate

Superseded by the [final frozen-runtime gate](./SHIP_CHROME_FINAL.md). This file preserves the earlier pre-fix snapshot's evidence.

Completed 2026-09-11 UTC. All final runs passed: 590 case executions, 298 Redact and 292 pinned React 19.3.0, with no skipped cases. Mode repeats are included. There are 207 unique shared cases and 3 additional Redact contract cases. [Exact commands and counts](./results/ship-chrome-parity.json).

| Chrome checks | Redact | React |
|---|---:|---:|
| Resource APIs, declarative resources, ownership, script execution | 58 | 58 |
| Activity, Suspense, retained refs/classes, layout/ref order | 61 | 61 |
| Native transitions, rejection recovery, image/font waits | 80 | 77 |
| Same native suite with reduced motion | 80 | 77 |
| Streamed CSS load, failure, nonmatching media, and CSP | 3 | 3 |
| Trusted Types and nonce hydration, development | 8 | 8 |
| Trusted Types and nonce hydration, production | 8 | 8 |

The three Redact-only cases cover its synchronous transition contract. They are not presented as React parity. React's development warnings for deliberate `flushSync` transition cancellation appeared as expected.

## Source and environment

Chrome 152.0.7977.83, macOS arm64, Node v24.15.0, Vitest 2.1.9, Playwright 1.59.1. Commands ran serially in the sole browser correctness slot. Other agents could run unit, build, and size checks, so these results must not be used as performance measurements.

The tested working tree includes uncommitted changes on commit `2e3c75c483365d26ae326ec0fdae96fa5c690451`. The completed runtime snapshot contains 83 files under `packages/redact/src`, SHA-256 `78171630e2953083e3597f3bad27f8c19b400cb3b559e2ecbd6d3d2008ffcfba`. The JSON ledger defines the hashing method. Later Suspense retry candidates and other source edits need their own affected-suite reruns.

## Test setup correction

The first resource run failed one case identically on both renderers: the first test expected an empty head, but Chrome's Vitest page already contained runner scripts and links. A `beforeEach` head reset now matches the existing `afterEach` reset. Both complete suites passed afterward. The ledger retains these preliminary failures. No runtime code or assertions changed during this gate.

## Limits

- Chrome only, with no Safari, Firefox, mobile hardware, or tanstack.com/tannerlinsley.com application coverage.
- Vitest tests use development runtime branches. Streamed CSS and the second security run use production bundles. Native production transition behavior was not separately tested here.
- Resource loading cases use controlled fixtures, with injected decode/rejection conditions where needed. DNS/preconnect cases assert emitted hints, not browser connection decisions.
- Trusted Types cases cover trusted HTML, iframe `srcDoc`, and nonce hydration. They do not directly exercise trusted script URL sinks or every CSP policy.
- Animation names, callbacks, CSS state, and native handles are checked, not perceptual animation quality.
- These fixtures do not establish exhaustive React parity or concurrent scheduling support.

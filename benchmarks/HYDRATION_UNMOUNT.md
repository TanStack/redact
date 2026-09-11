# Hydration and unmount fixes

This records the second follow-up snapshot. The [control-update pass](./CONTROL_RESTORE.md) fixes the two remaining checkbox/textarea failures described below. The measurements here remain tied to their original source hashes.

September 9, 2026. This pass fixes two behavior bugs without adding public APIs or changing Redact's synchronous scheduling.

- Replacing a child list with nothing no longer renders the old components before removing them. The old path could call class update lifecycles and even mount new descendants during removal. Six shared cases fail on the frozen baseline and pass on React and the fix. Existing cleanup, ref and native-removal ordering is preserved by a separate regression test.
- Hydration no longer mistakes edited input values or selection for a server-markup mismatch. Input reset defaults initialize separately from live state, and adopted selects keep the user's selection. Textareas follow React's actual initialization behavior, which depends on value type and does not preserve every edit. Generic attribute and structural mismatch checks remain intact.

## Measured changes

Production builds, Apple M5 Pro and Chrome 152, five independent browser blocks with five timed rounds each. The baseline is the completed previous follow-up, not published Redact. Negative time changes mean less time.

| Workload | Change from baseline | 95% interval |
|---|---:|---:|
| Subtree mount/unmount | -12.7% | -13.2% to -11.2% |
| Null-sibling updates | -4.3% | -5.2% to -3.4% |
| Batched state setters | -0.3% | -1.8% to 0.0% |
| Hydration | +5.2% | -0.5% to +6.8% |

Every measured mount/unmount cycle recorded two component renders on the old runtime, versus one on React and the fix. This connects the speedup to removed incorrect work, not just a timing difference. Most ordinary update changes were around the control-noise range. The previous pass's batched-update regression is not resolved by this change.

Hydration may be somewhat slower after the correctness work; the interval includes no change, so neither a definite regression nor zero cost is established. An isolated three-block experiment moved a redundant form-property check off ordinary adoption, but its estimated 2.0% gain had an interval from 3.4% less time to 2.0% more time. It added two gzip bytes and was not retained. The accepted full-run source was restored exactly.

Against React, mount/unmount still takes 35.9% more time and hydration takes 15.9% more. Context-through-memo takes 36.2% less time. Trusted-click durations remain tied at the browser's 16 ms reporting granularity, with no observed overall latency gain. The retained-memory check returns to zero extra DOM nodes after unmount in every block; that is not a general leak verdict or an allocation-rate measurement.

The identical-React control's median absolute time difference is 0.9%, with some workload intervals wider than 5%. Results remain workload-specific and exploratory. This pass does not test the real sites, physical mobile hardware, CPU slowdown or Node SSR. [Full measurements and raw samples](./HYDRATION_UNMOUNT_RESULTS.md), [reproduction](./README.md).

## Size and verification

Standalone minified production entrypoints, gzip bytes:

| Entry | Before this pass | After | Change |
|---|---:|---:|---:|
| Full DOM client | 11,287 | 11,415 | +128 |
| Nano DOM client | 7,419 | 7,427 | +8 |
| Server | 5,442 | 5,442 | 0 |

The full-client increase is about 1.1%. Full and Suspense-stripped size budgets were raised intentionally; the other configurations fit their existing budgets. These are entrypoint measurements, not whole-app sizes.

The default suite's 1,041 tests across 57 files pass, along with types, the production build, size checks and three benchmark-statistics tests. The 34 hydration cases pass against both Redact and pinned React 19.3 in jsdom and real Chrome. The six shared removal cases also pass both renderers.

An independent audit verified all 1,600 throughput samples, 480 clicks and 60 memory cycles, matched every recorded source hash, rebuilt all four bundles byte-for-byte and reproduced every saved throughput summary and comparison.

The former opt-in input-hydration failure is now part of the default passing suite. Two new opt-in cases pass React and fail Redact: after hydration preserves live state, an update with unchanged controlled checkbox or textarea props does not restore that controlled state. Those are separate update-path gaps, recorded in `benchmarks/control-update-gaps.cases.tsx`, not silently counted as passing. Run them with `scripts/control-update-gaps.config.mjs` and `REACT_REFERENCE=1` for the reference.

The [compatibility audit](../docs/REACT_19_3_AUDIT.md) also lists unimplemented APIs and other work still needed. Nothing is committed or published.

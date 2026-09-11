# Control updates and small runtime optimizations

This pass follows the [hydration and unmount fixes](./HYDRATION_UNMOUNT.md). Public APIs and synchronous scheduling are unchanged.

## Behavior fixes

- Actual host updates restore unchanged controlled checkbox and textarea state after external edits, including after hydration.
- Input checked state and reset defaults are updated separately. Radio name changes cannot temporarily deselect a checked radio in the destination group before the new checked state is applied.
- Textareas own their text instead of reconciling child fibers. Their live value, reset default, legacy initial children and cleanup observations follow the shared React cases. Unchanged focused values are not rewritten.
- Textarea mount and hydration share initialization. React distinguishes string and non-string initial values when deciding whether to assign the live value, which changes how later uncontrolled default updates behave.

## Candidates

The data/aria setter handles those attributes before generic alias and boolean-attribute checks. Its existing stringification and removal rules are unchanged.

The placement shortcut skips collecting DOM nodes when there is exactly one direct host or text child already in the right parent at the exact anchor. Fragments, portals, multiple children and misplaced nodes use the existing path.

The comparison separates control fixes from these optional optimizations. It includes React, a byte-identical React control, the previous Redact, correctness-only Redact and the final candidate. [Reproduction](./README.md).

## Measurements

September 9, 2026, production bundles on Apple M5 Pro and Chrome 152. The full comparison uses five fresh-browser blocks and five timed rounds per workload. Negative changes mean less time, relative to the preceding Redact source.

| Workload | Change from previous Redact | 95% interval |
|---|---:|---:|
| Subtree mount/unmount | -5.3% | -6.9% to -5.1% |
| Null-sibling updates | -4.2% | -5.9% to -1.9% |
| Automatic-JSX prop updates | -2.0% | -2.3% to -1.2% |
| Prop updates | -1.2% | -2.1% to -0.4% |
| Stable keyed rows | +0.4% | -1.8% to +2.5% |
| Controlled selects | +1.5% | +0.7% to +1.7% |
| Hydration | +2.5% | -3.5% to +4.4% |

Against correctness-only Redact, the optional changes reduce mount/unmount time by 5.2%, null-sibling updates by 3.6% and automatic-JSX prop updates by 1.8%. Stable keyed rows take 0.9% more time, with an interval of +0.1% to +2.5%. These are small tradeoffs, not an across-the-board speedup. Hydration remains uncertain.

The focused five-block repeat supports keeping both optional changes. Compared with previous Redact, mount/unmount improves 5.8% (interval -6.4% to -5.2%) and automatic-JSX prop updates improve 1.6% (-7.8% to -0.8%). Compared with correctness-only, those improvements are 5.1% and 3.7%. The small stable-keyed regression does not repeat: -0.1% versus correctness-only, with an interval of -1.9% to +1.5%.

Hydration takes 2.8% more time than previous Redact in the repeat, with an interval of -1.8% to +8.0%; the optional changes alone measure +2.8%, with an interval of -1.4% to +5.8%. A modest hydration cost remains possible. The repeat also puts Redact 25.2% behind React on mount/unmount and 19.6% behind on hydration. Absolute timings and React-relative ratios vary between runs, so neither run establishes whole-app performance.

Against React in the full run, Redact takes 30.7% more time for mount/unmount and 14.4% more for hydration, while context-through-memo takes 34.9% less time. The identical-React control's median absolute time difference is 0.5%; some individual intervals are much wider. The intervals are exploratory and not adjusted for multiple comparisons.

All observed click-duration medians remain 16 ms at the browser's reporting granularity. No end-to-end click latency improvement is established. Every renderer returns to zero extra DOM nodes after the last unmount in each block. This is not an allocation-rate measurement or a general leak verdict. [Full measurements and raw data](./CONTROL_RESTORE_RESULTS.md).

## Size and verification

Standalone minified full-client entrypoint:

| Source | Raw bytes | Gzip bytes |
|---|---:|---:|
| Previous Redact | 31,255 | 11,415 |
| Control fixes only | 31,839 | 11,551 |
| Control fixes and speed candidates | 31,937 | 11,588 |

The behavior fixes add 136 gzip bytes. The optional optimizations add another 37, for a total increase of 173 bytes, about 1.5%. The server remains 13,776 raw and 5,442 gzip bytes. Nano grows from 7,427 to 7,666 gzip bytes (+239, about 3.2%): without hydration, it cannot reuse the initializer that full client already shipped. Current Suspense-stripped and hydration-stripped clients are 10,641 and 9,211 gzip bytes. All four DOM-client budgets are raised deliberately with about 25 bytes of headroom; the React entrypoint budget is unchanged.

The 56 control-update cases and 34 hydration-form cases pass against both Redact and pinned React 19.3 in jsdom and real Chrome. The full default suite passes 1,113 tests across 60 files. Types, the production build, all size budgets and the three benchmark-statistics tests pass. Ten attribute tests preserve the setter's previous behavior; six placement regressions cover anchors, moved refs, foreign nodes, fragments and portals.

An independent audit checked all 2,500 throughput samples, 600 validated clicks and 75 memory cycles across the two accepted runs. Every recorded source, fixture, runner, statistics and reference-lock hash matches disk. All five production fixture bundles rebuild byte-for-byte, the React/control bundles are identical, and independent calculations reproduce every saved throughput comparison and click summary. Nothing is committed or published.

An initial comparison was rejected because a frozen source folder did not match its package's `sideEffects` paths. The corrected snapshot preserves the real package layout, and the runner now rejects ignored side-effect imports before collecting timings. It also rejects unknown workload/phase names; the report rejects explicitly requested missing result files. Reconstructed baselines are checked byte-for-byte against the measured snapshots.

These fixtures measure completed rendering work and ordinary trusted clicks, not the latency of a user editing a controlled form field. They do not cover either real site, physical mobile hardware or field INP. The [compatibility audit](../docs/REACT_19_3_AUDIT.md) still records unimplemented APIs and remaining behavior gaps.

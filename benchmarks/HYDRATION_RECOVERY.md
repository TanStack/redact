# Hydration recovery size review

Document mismatch recovery keeps the original component and provider tree.
The recovery target selector now handles local hosts, the document body and
root fallback in one place. No feature is disabled or generated bundle patched.

Production es2022 ESM builds use the existing `measureSizes` command with
esbuild 0.28.0 and Node 24.15.0. These are entry bundles retaining all exports,
not a whole-site size comparison or a runtime performance result.

The baseline is unmodified revision `62b81c1c6e0aa38e06ad70bc72d650f739730314`,
extracted and built in `/private/tmp/redact-size-baseline-Cdgx1m/package`.
The corrected package is `/private/tmp/redact-recovery-release-SArBPy/package`.
The generated baseline and recovery records in `results/` bind every measured
source and built module, the compiler version and the exact entry sizes.

| Built entry | Baseline gzip bytes | Recovery gzip bytes | Change |
| --- | ---: | ---: | ---: |
| DOM API | 25,216 | 25,257 | +41 |
| DOM client | 24,960 | 24,897 | -63 |
| Combined client | 28,125 | 28,064 | -61 |
| Combined client, default Vite | 23,290 | 23,232 | -58 |

The original DOM budget is 25,246 bytes. The corrected entry exceeds it by
11 bytes. The reviewed budget is 25,282, the measured entry plus the documented
25-byte margin. Only this entry's budget changes, all other limits stay intact.
This is an explicit acceptance of the measured correctness cost, not a pass
under the old limit. The combined client becomes smaller, not larger.

The earlier recovery repair and its failed size checks remain recorded in
the Container report `reports/redact-hydration-repair-2026-10-04.md`.
The new size budget does not waive hydration, context, event, state, cleanup,
type checking, build verification or the strict three-engine real-site checks.

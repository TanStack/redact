# Hydration recovery size review

Document mismatch recovery keeps the original component and provider tree.
The recovery target selector now handles local hosts, the document body and
root fallback in one place. No feature is disabled or generated bundle patched.

Production es2022 ESM builds use the existing `measureSizes` command with
esbuild 0.28.0 and Node 24.15.0. These are entry bundles retaining all exports,
not a whole-site size comparison or a runtime performance result.

The baseline is unmodified revision `62b81c1c6e0aa38e06ad70bc72d650f739730314`,
extracted and built in `/private/tmp/redact-size-baseline-Cdgx1m/package`.
The corrected package is `/private/tmp/redact-hydration-reviewed-f0677f5/package`.
The generated baseline and recovery records in `results/` bind every measured
source and built module, the compiler version and the exact entry sizes.

| Built entry | Baseline gzip bytes | Recovery gzip bytes | Change |
| --- | ---: | ---: | ---: |
| DOM API | 25,216 | 25,252 | +36 |
| DOM client | 24,960 | 24,894 | -66 |
| Combined client | 28,125 | 28,061 | -64 |
| Combined client, default Vite | 23,290 | 23,227 | -63 |

The original DOM budget is 25,246 bytes. The corrected entry exceeds it by
6 bytes. The approved budget remains 25,282, leaving a 30-byte margin.
Only this entry's budget changes, all other limits stay intact.
This is an explicit acceptance of the measured correctness cost, not a pass
under the old limit. The combined client becomes smaller, not larger.

PR review also caught cleanup targeting the entire document when a narrowed
recovery retry throws. Cleanup now retains the same narrowed target. Its new
regression fails before the fix and passes afterward, preserving the document
shell and head resources. Both reset calls now pass an explicit target, so the
unused default parameter is removed. This reduces the approved candidate by
5 gzip bytes for the DOM API and 3 for the combined client, without adding work
to the render path.

Compression does not move uniformly. Compared with the approved candidate,
minified sizes are unchanged, while the built DOM entry adds 39 Brotli bytes.
Against the original baseline, that entry is +44 minified, +36 gzip and
+72 Brotli bytes. DOM client, combined client and default-Vite combined client
remain smaller in all three formats. The JSON records include every feature
variant, including Brotli increases in some variants. No additional budget
increase is made for the review fix.

The earlier recovery repair and its failed size checks remain recorded in
the Container report `reports/redact-hydration-repair-2026-10-04.md`.
The new size budget does not waive hydration, context, event, state, cleanup,
type checking, build verification or the strict three-engine real-site checks.

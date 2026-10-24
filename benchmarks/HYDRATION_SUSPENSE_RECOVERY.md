# Hydration and Suspense recovery review

The baseline is pristine main `becad73`, built separately with the same installed dependencies and Node 26.3.1. Measurements use `node scripts/size-check.mjs`, esbuild 0.28.0, and production entry bundles. These are compressed library sizes, not page load or runtime benchmarks.

The SVG attribute table preserves the HTML parser's mixed-case names in both SSR and DOM updates. This must cover names beyond clipPathUnits because attributeName lowercases other names after its clip/fill/stroke conversion.

Built output adds 574 gzip bytes to the combined client and 582 bytes with default Vite features. The budget change accepts this measured correctness cost explicitly. Only exceeded limits increase, to the measured value without extra margin. Other limits remain unchanged.

| Tree | Entry | Baseline gzip bytes | Candidate gzip bytes | Change |
| --- | --- | ---: | ---: | ---: |
| src | redact | 2760 | 2760 | +0 |
| src | redact/jsx-runtime | 189 | 189 | +0 |
| src | redact/dom | 24931 | 25641 | +710 |
| src | redact/dom-client | 24564 | 25153 | +589 |
| src | redact/server | 8936 | 9318 | +382 |
| src | client total | 27761 | 28356 | +595 |
| src | client total (default Vite) | 22972 | 23558 | +586 |
| src | redact/dom-client (activity=stub) | 24032 | 24613 | +581 |
| src | redact/dom-client (fragmentRefs=stub) | 22405 | 22999 | +594 |
| src | redact/dom-client (viewTransitions=stub) | 19815 | 20414 | +599 |
| src | redact/dom-client (portal=stub) | 24537 | 25121 | +584 |
| src | redact/dom-client (context=stub) | 24282 | 24870 | +588 |
| src | redact/dom-client (suspense=stub) | 23072 | 23617 | +545 |
| src | redact/dom-client (memo=stub) | 24481 | 25073 | +592 |
| src | redact/dom-client (forwardRef=stub) | 24532 | 25118 | +586 |
| src | redact/dom-client (lazy=stub) | 24566 | 25154 | +588 |
| src | redact/dom-client (classComponents=stub) | 24097 | 24558 | +461 |
| src | redact/dom-client (hydration=stub) | 22101 | 22709 | +608 |
| src | redact/dom-client (nano) | 12212 | 12669 | +457 |
| dist | redact | 2759 | 2759 | +0 |
| dist | redact/jsx-runtime | 190 | 190 | +0 |
| dist | redact/dom | 25219 | 25949 | +730 |
| dist | redact/dom-client | 24879 | 25461 | +582 |
| dist | redact/server | 8936 | 9316 | +380 |
| dist | client total | 28060 | 28634 | +574 |
| dist | client total (default Vite) | 23232 | 23814 | +582 |
| dist | redact/dom-client (activity=stub) | 24329 | 24911 | +582 |
| dist | redact/dom-client (fragmentRefs=stub) | 22703 | 23273 | +570 |
| dist | redact/dom-client (viewTransitions=stub) | 20107 | 20674 | +567 |
| dist | redact/dom-client (portal=stub) | 24847 | 25428 | +581 |
| dist | redact/dom-client (context=stub) | 24593 | 25179 | +586 |
| dist | redact/dom-client (suspense=stub) | 23365 | 23907 | +542 |
| dist | redact/dom-client (memo=stub) | 24786 | 25371 | +585 |
| dist | redact/dom-client (forwardRef=stub) | 24835 | 25415 | +580 |
| dist | redact/dom-client (lazy=stub) | 24866 | 25449 | +583 |
| dist | redact/dom-client (classComponents=stub) | 24400 | 24857 | +457 |
| dist | redact/dom-client (hydration=stub) | 22368 | 22986 | +618 |
| dist | redact/dom-client (nano) | 12453 | 12905 | +452 |

## Regression commands

`pnpm test:ci` runs the full jsdom suite, types, built export verification, and source/dist size budgets. The four new test files are included by the existing test glob. The lazy-image resource assertion requires a real browser and is skipped in jsdom.

`pnpm exec playwright install --with-deps chromium` then `pnpm test:recovery:browser` runs all 14 regression cases in Chromium. The PR workflow runs this command. For a locally installed Chrome, set `RECOVERY_CHROME=1`.

`REACT_REFERENCE=1 pnpm test:recovery:browser` uses the existing `benchmarks/reference` React installation as a control. Three Redact-specific hydration policies (four cases) are excluded: inert custom-element validation and recoverable opaque-markup differences. React does not share those recovery policies. The remaining ten cases use the same public React APIs in both runtimes.

`REDACT_TEST_SOURCE=/absolute/path/to/pristine/packages/redact/src pnpm exec vitest run --config scripts/hydration-recovery.config.mjs` runs the regressions against a separate pristine source checkout. The original jsdom run reproduced nine failures before the fixes. The full browser suite reproduced eleven failing cases and three passing controls on pristine main. The browser configuration supports the same source override.

These tests cover library contracts. They do not claim complete React compatibility or whole-application parity.


## Noscript follow-up

Commit `b1c945f` adds opaque noscript hydration and skips client fallback child
rendering. The native-browser regression checks that the server fallback renders
once, its raw text remains intact, and an adjacent button retains its DOM node
and updates its state. A separate regression covers client mount and update.

[CI run 38592959191](https://github.com/TanStack/redact/actions/runs/38592959191)
passed 1,653 unit tests, TypeScript, and build/export verification. It stopped at
the size gate, before the Chromium regression stage. Local runtime tests were
not rerun for this follow-up. Only exceeded budgets are updated to that run's
measured maximum across source and built bundles, without additional margin.
These are differences against previous budget ceilings, not an isolated
measurement of the noscript fix against the prior commit.

| Bundle | Previous ceiling | CI maximum gzip | Increase |
| --- | ---: | ---: | ---: |
| redact/server | 9318 B | 9336 B | 18 B |
| redact/dom | 25949 B | 25977 B | 28 B |
| redact/dom-client | 25461 B | 25494 B | 33 B |
| client total | 28634 B | 28668 B | 34 B |
| redact/dom-client (activity=stub) | 24911 B | 24939 B | 28 B |
| redact/dom-client (fragmentRefs=stub) | 23273 B | 23305 B | 32 B |
| redact/dom-client (portal=stub) | 25428 B | 25462 B | 34 B |
| redact/dom-client (context=stub) | 25179 B | 25214 B | 35 B |
| redact/dom-client (suspense=stub) | 23907 B | 23942 B | 35 B |
| redact/dom-client (memo=stub) | 25371 B | 25400 B | 29 B |
| redact/dom-client (forwardRef=stub) | 25415 B | 25445 B | 30 B |
| redact/dom-client (lazy=stub) | 25449 B | 25482 B | 33 B |
| redact/dom-client (classComponents=stub) | 24857 B | 24891 B | 34 B |
| redact/dom-client (hydration=stub) | 22986 B | 23036 B | 50 B |
| redact/dom-client (nano) | 12905 B | 12920 B | 15 B |

# State round-trip bailout

An inline callback ref can detach with `null` and reattach the same DOM node during one commit. If it writes that node to state, the final queued value equals the previous committed value. React renders once to process that queue, then skips another commit. Without that bailout, every new inline ref starts the cycle again.

## Node/jsdom evidence

These five initial shared cases ran with a guard that throws after 16 component renders. An extra recovery render can still occur after the guard. No runtime code was changed during the initial comparison.

| Renderer | Inline ref, mount | Inline ref, hydrate | Layout effect, values away/back | Layout effect, functions away/back | Event batch, away/back |
|---|---|---|---|---|---|
| React 19.3.0 | Pass, 3 renders / 2 commits | Pass, 3 / 2 | Pass, 2 / 1 | Pass, 2 / 1 | Pass, 2 / 1 |
| Published Redact 0.0.20, built `dist` | Settles, 2 / 2 | Settles, 2 / 2 | Guard reached | Guard reached | Extra commit |
| Before expansion, `/tmp/redact-commit-error-parity/src` | Guard reached | Guard reached | Guard reached | Guard reached | Extra commit |
| Current Redact before marker fix | Guard reached | Guard reached | Guard reached | Guard reached | Extra commit |
| Current Redact with marker fix | Pass, 3 / 2 | Pass, 3 / 2 | Pass, 2 / 1 | Pass, 2 / 1 | Pass, 2 / 1 |

Published Redact called the inline ref only once. React and fixed Redact produced `node, null, node`. The published result therefore shows that the page settles, not that its ref lifecycle matches React. Correct ref replacement exposed an existing state-bailout gap.

Current Redact's failing ref cases reached 17 renders on mount and 18 on hydration, with 16 commits. Both layout-effect cases reached 17 renders and 16 commits. The guard prevented an unbounded test run.

## Fix and stress checks

The dispatcher now uses `hook.c = 0` to mark eager state work without allocating an action array. Pending state work compares against `hook.d`, the prior rendered state. A final unchanged value reaches the existing bailout. Custom reducers still compare against their previous `hook.s`.

The expanded suite passes all 13 cases on fixed Redact and pinned React. It adds throwing updaters with and without earlier eager work, render-phase updates affecting another hook, simultaneous reducer/store/context changes, and component/descendant Suspense replay. Final DOM, effect traces, error routing, and identity are asserted. Render counts during error recovery and Suspense retry are not required to match.

The hook snapshot stores the zero marker directly. Render-phase updates convert it into an action array through the existing queue path. `pnpm test:types` also passes.

Final dispatcher SHA-256: `b81c28dccc54bbaadd8183a8f1fd34f8ddccb768388504af6de5b30837f44c10`.

## Reproduction

Run from the repository root. `STATE_REF_TRACE=1` prints bounded render, commit, ref, and error observations.

```sh
STATE_REF_TRACE=1 REACT_REFERENCE=1 pnpm exec vitest run --config scripts/state-ref-bailout.config.mjs
STATE_REF_TRACE=1 pnpm exec vitest run --config scripts/state-ref-bailout.config.mjs
STATE_REF_TRACE=1 PUBLISHED_REDACT=1 pnpm exec vitest run --config scripts/state-ref-bailout.config.mjs
STATE_REF_TRACE=1 REDACT_TEST_SOURCE=/tmp/redact-commit-error-parity/src pnpm exec vitest run --config scripts/state-ref-bailout.config.mjs
```

The historical comparison ran before the eight stress cases were added. To select those original five cases from the expanded file, add:

```sh
-t 'settles inline|does not recommit|does not rerender descendants'
```

The published configuration lets Vite process the package's extensionless imports, as its consumer bundler does. The initial unconfigured Node externalization attempt collected no tests and is not counted as a renderer failure.

This investigation used Node/jsdom only. It reproduces a plausible hydration-loop cause, but does not establish that it is the only tanstack.com issue. Browser and real-site verification are separate gates.

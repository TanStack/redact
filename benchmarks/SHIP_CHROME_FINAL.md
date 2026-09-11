# Final frozen-runtime Chrome gate

Completed 2026-09-11 UTC. This supersedes the [pre-fix browser ledger](./SHIP_CHROME_PARITY.md). Final runs passed 1,266 case executions, 637 Redact and 629 pinned React 19.3.0. Seven predeclared exclusions remain. Counts include repeated motion modes and overlapping suites, not 1,266 unique behaviors. [Exact commands, per-file counts, exclusions, and input hashes](./results/ship-chrome-final.json).

| Gate | Redact passed | React passed | Comparison notes |
|---|---:|---:|---|
| Core APIs, hooks, context, reducers, errors, controls, hydration | 322 | 320 | 3 Node-only pipeable cases each, plus 1 known React Activity hydration failure |
| Resources and ShadowRoot ownership/CSS | 75 | 75 | None |
| Activity, retained refs/classes, layout order | 61 | 61 | None |
| Native transitions and image/font waits | 80 | 77 | 3 Redact-only contract cases are not shared comparisons |
| Same native suite with reduced motion | 80 | 77 | Same 3 Redact-only cases |
| Streamed CSS/CSP, production | 3 | 3 | None |
| Trusted Types and nonce hydration, development | 8 | 8 | None |
| Trusted Types and nonce hydration, production | 8 | 8 | None |

Core also includes one Redact-only synchronous reducer test. Its extra Activity hydration pass does not close the corresponding React comparison gap. No exclusions were added during this run.

The resource gate includes 15 ShadowRoot ownership cases and two new real-CSS checks: separate inline CSS across the document and shadow roots, including portals and same-root deduplication; and shadow-local external stylesheets despite a loaded document preinit. Both verify CSS remains active after component unmount.

## Two shared fixture corrections

The first core run stopped on a scroll assertion. React reproduced the same failure: an empty div could not retain an assigned `scrollTop` of 42. The fixture now has a 50px scroll viewport and 200px child, with a new pre-suspension assertion that scrolling actually occurred. All original identity, visibility, context, and scroll assertions remain.

React's next core run stopped because a Suspense test expected loaded content after two 20ms delays. It now uses a bounded `vi.waitFor` around the same content and fallback assertions. Initial fallback, lifecycle count, and error assertions remain. Both full core suites passed after these corrections. The JSON ledger retains the failed-run counts and exact commands.

## Frozen source

The renderer includes the state no-op marker, Suspense retry optimization, Activity capture fix, and ShadowRoot resource ownership. The 82 source files excluding `vite/` hashed identically before and after the completed gates:

`7ea8a6e3ccc01cd8495d8d62f92ed538d7b427dd5196215039b84869937a6dd5`

The authorized packaging change in `packages/redact/src/vite/index.ts` happened separately. The full 83-file source hash changed from `24169ae569627f0bc1b2a458c85b7f4ceb8e7b69aac54f21c485709df9c6db88` at preparation to `04960e78cca832b325f98a7c912db80820b0cabfaf58a5248832b5367983177a` at completion. These fixtures import renderer source directly and do not establish Vite-package import compatibility.

Chrome 152.0.7977.83, macOS arm64, Node v24.15.0, Vitest 2.1.9, Playwright 1.59.1. Browser commands ran serially in one exclusive browser slot. Chrome and all test processes were stopped at completion. Other non-browser checks could run concurrently, so durations are not performance measurements.

After this gate, a type-only edit made the `config` argument optional in `createElement` and `cloneElement`. It changes `react/element.ts`'s source hash but no emitted JavaScript. Browsers were not rerun after that edit. Its post-gate hashes are recorded separately in the JSON ledger; unit, type, and NodeNext packaging checks are separate evidence.

## Limits

- The known React hidden-server-to-visible-client Activity hydration case remains uncovered. Node-only pipeable stream coverage belongs to the Node gate.
- Chrome only. Safari, Firefox, physical mobile, and real-site results are separate evidence.
- Vitest uses development runtime branches. Production streaming and security passed, but native production transition behavior was not separately tested here.
- Controlled resource fixtures do not measure network performance. DNS hints are inspected, not confirmed as network connections.
- Trusted Types coverage is trusted HTML, iframe `srcDoc`, and nonce hydration, not every CSP sink or trusted script URL assignment.
- Native animation handles, names, callbacks, and CSS are checked, not perceptual animation quality.
- This is not exhaustive React parity, concurrent scheduling support, a bundle-size result, or a whole-application release claim.

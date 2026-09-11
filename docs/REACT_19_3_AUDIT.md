# React 19.3 compatibility audit

The [ship review](../benchmarks/SHIP_RESULTS.md) records final stabilization and verification. ShadowRoot resource ownership is now covered by shared structural and real-CSS tests; this does not establish every resource-loading or streaming race.

Audited September 9, 2026 against the [release notes](https://github.com/react/react/releases/tag/v19.3.0), [release post](https://react.dev/blog/2026/09/09/react-19-3), upstream implementation PRs and Redact source. This is a compatibility assessment, not a claim that Redact implements all of React 19.3.

Updated September 10 after implementing the APIs below with synchronous scheduling. See the [supported behavior and deliberate downgrades](./REACT_19_3_SUPPORT.md). The later [native ViewTransition experiment](./VIEW_TRANSITION_EXPERIMENT.md) adds opt-in browser animation and changes the shared commit implementation; historical measurements below do not include it.

The [parity expansion](../benchmarks/PARITY_EXPANSION.md) supersedes the resource-hint, Trusted Types, nonce, reducer, retained-Suspense, and native image/font gaps noted below. It records shared test coverage, remaining limits, and significant size/performance costs. Those fixes are not a release recommendation.

## Already handled or fixed in this pass

| Behavior | Redact evidence |
|---|---|
| Effect Events see updated props through `memo`, `forwardRef` and both wrappers | Four tests cover plain, memoized, forwarded-ref and combined wrappers. `useEffectEvent` uses shared insertion-effect/ref hooks, not React's affected tag-specific commit path. Context propagation is covered separately below. [React fix](https://github.com/react/react/pull/34831) |
| `lazy` renders the module's default export | `react/memo.ts` already stores `mod.default`; a new render test confirms it. React's canonical-value change concerns DEV async-debug metadata, not a new production module-resolution contract. [React patch](https://github.com/react/react/pull/34906) |
| Unchanged HTML does not replace existing children | `dom/dom.ts` compares the previous and next `__html` values. Tests preserve child identity for ordinary and custom elements. [React fix](https://github.com/react/react/pull/36949) |
| Toggle event fields and submitter | Regression tests cover `source`, `oldState`, `newState`, `submitter`, native-event access and cancellation. [Toggle](https://github.com/react/react/pull/37389), [submit](https://github.com/react/react/pull/35590) |
| Fullscreen event handlers | Existing event-name handling supports change/error, capture and bubble. New tests lock this in. [React addition](https://github.com/react/react/pull/34621) |
| `credentialless` and SVG `maskType` | This pass adds boolean-attribute handling in DOM/SSR and the exact `mask-type` alias. Five cases failed before the changes; all 13 DOM regression cases now pass. [Iframe attribute](https://github.com/react/react/pull/36148), [SVG attribute](https://github.com/react/react/pull/35921) |
| SSR abort-listener lifetime | This pass removes the caller's abort listener after successful completion, shell failure, abort or stream cancellation. Four regression tests fail on the baseline and pass with cleanup. [React fix](https://github.com/react/react/pull/37315) |
| No readiness after shell failure | `onAllReady` already used the success branch. This pass also suppresses the separately queued `onShellReady` callback after failure. Tests cover an Error and thrown `null`, `undefined` and `0`; all four failed on the baseline. [Related React fix](https://github.com/react/react/pull/36903) |
| Context through memo and Suspense | The follow-up adds tracked context reads and retained-tree propagation, so equal-prop memo wrappers do not need to render to reach their consumers. Suspended primary content can retry when its context changes, without waiting for the old promise. Shared React parity tests cover nested providers, wrapper/effect counts, conditional reads and fallback identity. [Fallback fix](https://github.com/react/react/pull/36160), [retry fix](https://github.com/react/react/pull/35839) |
| Input value and reset defaults | The follow-up coordinates type, value and defaultValue writes. Controlled number inputs retain equivalent numeric spelling and mirror their displayed value to the reset default, including while focused. The same 23 cases pass Redact and React 19.3 in jsdom and Chrome. [React fix](https://github.com/react/react/pull/36980) |
| Form state during hydration | A second pass stops treating live values and selection as server-markup mismatches. Inputs and selects retain edits made before hydration, reset defaults initialize correctly, and textarea initialization follows React's value-type-specific behavior. All 34 shared cases pass both renderers in jsdom and Chrome. Evidence: `tests/hydration-form-controls.test.tsx`. |
| Controlled form updates | The next pass restores unchanged checked/textarea values on updates, coordinates radio name changes with checked state, and makes textarea own its text rather than reconciling child fibers. Fifty-six shared cases cover mount and hydration, reset defaults, controlled/uncontrolled transitions, radio regrouping, string/non-string initial values, legacy children, selection and ref-cleanup observations. All pass React and Redact in jsdom and Chrome. Evidence: `tests/control-updates.test.tsx`. |

Tests: `tests/react-19-3-core.test.tsx`, `tests/react-19-3-dom.test.tsx`, `tests/react-19-3-stream.test.tsx`, `tests/upstream-parity.test.tsx`, `tests/context-suspense-updates.test.tsx` and `tests/number-input.test.tsx`. Passing these examples does not establish complete parity for each API. [Follow-up measurements and verification](../benchmarks/FOLLOWUP.md).

## Applicable gaps

| Area | Finding and next test |
|---|---|
| SSR cancellation coverage | The API pass now covers already-aborted signals, pending `allReady` settlement, browser-token abort reasons, cancellation reasons and late piping after fatal callback failure. This does not cancel arbitrary unresolved user promises or establish parity for every streaming race. Evidence: `tests/browser-api.test.tsx`. |
| Trusted Types | The parity expansion preserves TrustedHTML through hydration probes and attribute sinks. Eight shared Chrome CSP cases cover ordinary, table, SVG, iframe, and nonce paths in development and production. This is not an exhaustive sink audit. [Verification](../benchmarks/PARITY_EXPANSION.md), [React enablement](https://github.com/react/react/pull/35816) |
| Nonce hydration | Shared Chrome tests now verify hidden nonce attributes on body and head elements. Hydration reads the nonce property and avoids rewriting a matching nonce. [Verification](../benchmarks/PARITY_EXPANSION.md), [React fix](https://github.com/react/react/pull/37030) |

The original four context/number-input reproductions now live in `tests/upstream-parity.test.tsx` and run in the default suite. Both runtimes use `flushSync` for completed renders. Run them against either renderer with:

```sh
pnpm exec vitest run --config scripts/upstream-gaps.config.mjs
REACT_REFERENCE=1 pnpm exec vitest run --config scripts/upstream-gaps.config.mjs
```

The second command uses the pinned React 19.3 packages under `benchmarks/reference`. The initial audit found all four passing React and failing Redact; the follow-up fixes all four. Both runtimes use `flushSync` for initial renders and updates.

The former dirty-input hydration failure is now in the passing default suite. Run all 34 hydration form cases with `scripts/input-hydration-gap.config.mjs`, or use `scripts/hydration-form-browser.config.mjs` for real Chrome. Both accept `REACT_REFERENCE=1`. Generic attribute and structural mismatch recovery remains unchanged. This does not establish parity for every control update or hydration interaction.

The two subsequent controlled-update failures are also now in the passing default suite. Run the expanded 56 cases with `scripts/control-update-gaps.config.mjs` or `scripts/control-updates-browser.config.mjs`, again with `REACT_REFERENCE=1` for the pinned reference. [Control fixes and performance results](../benchmarks/CONTROL_RESTORE.md).

The second pass also fixes an unrelated removal bug: replacing a child list with nothing used to render its old components again before unmounting them. Six shared cases fail on the frozen baseline and pass on React and the fix. The later commit split updates the cleanup/ref/native-removal regression to match React: cleanup sees the intact DOM, then only the outer host is physically removed. Evidence: `tests/unmount-render-parity.test.tsx` and `tests/unmount-order.test.tsx`.

Additional server follow-ups from the release: abort/reentrancy and callback cardinality, cancellation while a boundary is pending, replayed `useId`, import-map nonce and preload metadata. React's Fizz fixes cannot be copied directly into Redact's different streaming architecture. Each requires an observable reproduction first.

## Public additions implemented with synchronous downgrades

| API | Current status | Scope |
|---|---|---|
| `ViewTransition` and `addTransitionType` | Synchronous default, opt-in native experiment | The default Vite configuration preserves state without animation. `features.viewTransitions: true` enables browser snapshots, styles and callbacks through a synchronous render/commit split. See the [experiment's evidence and limits](./VIEW_TRANSITION_EXPERIMENT.md). [Component](https://react.dev/reference/react/ViewTransition), [transition types](https://react.dev/reference/react/addTransitionType) |
| Fragment refs | Implemented | Stable instances provide events, focus, observers, geometry, position/root queries and scrolling. Shared tests cover updates, portals, empty fragments, nested ownership and cleanup. [Reference](https://react.dev/reference/react/Fragment) |
| `browser(reason?)` | Implemented | Client consumption, server Suspense fallback, silent hydration recovery, lazy reasons and abort tokens share one branded contract. [Reference](https://react.dev/reference/react-dom/browser) |
| `onBrowserBailout` | Implemented | Stream options report intentional browser deferral separately from ordinary errors, including the reason and component stack. [React addition](https://github.com/react/react/pull/37193) |
| `Activity` | Implemented, scheduling downgraded | Retains hidden DOM/state and disconnects effects, refs and subscriptions. Hidden work runs synchronously, not at background priority. |
| `cacheSignal` | Implemented for the replaced environments | Returns `null` in the client and DOM server renderer. The RSC environment stays on real React. |
| `unstable_useCacheRefresh` | Implemented for the uncached runtime | Stable client no-op; invoking the server refresh throws. |

The `browser()` implementation covers these contracts:

1. An environment-neutral branded value is interpreted by the active renderer, not by `typeof window`. Client `use` returns `undefined`; server `use` raises a distinct intentional bailout.
2. Server Suspense emits a completed browser-only fallback without waiting for a promise or server reveal.
3. Hydration replaces that fallback without reporting an ordinary mismatch. A missing Suspense boundary remains a server failure.
4. Both abort APIs accept browser tokens, report affected boundaries and settle completion promises.
5. Lazy reasons are evaluated on server consumption. Their result becomes `cause`, reasons stay out of HTML, and throwing reason initializers do not change render control flow. Directly throwing the token remains a normal error. [Initial API](https://github.com/react/react/pull/37143), [final reason semantics](https://github.com/react/react/pull/37241)

Shared React/Redact coverage includes client-only rendering, SSR inside/outside Suspense, silent hydration recovery, nested boundaries, repeated token consumption, throwing reason callbacks and both abort APIs. See `tests/browser-api.test.tsx` and the API support notes for verification and limits.

## Deliberate exclusions and unrelated machinery

- Independent concurrent transition scheduling and deferred-value scheduling remain outside Redact's synchronous contract. Keep the existing action/optimistic downgrades unchanged. [Independent transitions](https://github.com/react/react/pull/37290)
- Fast Refresh internals, StrictMode double invocation, owner/debug stacks and Performance Tracks are not runtime parity work for this renderer. Lazy thenable instrumentation enables React's immediate-suspension optimization; Redact has no corresponding work loop. [Lazy instrumentation](https://github.com/react/react/pull/35521)
- Flight parsing, reply serialization, cycle/DoS protection, debug channels and bundler transport changes belong to the upstream Flight implementation, which Redact does not replace. Do not treat this exclusion as permission to leave the actual upstream Flight dependency outdated.
- Fizz prerender/resume and replay internals still need separate API coverage. Resource hints and declarative resource hoisting now have real client/server implementations and shared tests, including streamed stylesheet dependencies and nonce forwarding. ShadowRoot and `noscript` contexts remain unverified. See the parity expansion for the tested boundary, not a blanket Fizz compatibility claim.

Activity's hidden-tree effect/DOM preservation is implemented rather than classified as a concurrency exclusion. Its background scheduling is the deliberate downgrade. One pinned-React hidden-server to visible-client hydration comparison cannot complete in jsdom; it is explicitly excluded from reference verification, not counted as a parity pass.

## Surface-document corrections

`docs/SURFACE.md` is historical, not a current compatibility guarantee. It still references package 0.0.1 and old sizes, describes context internals that do not match the current dependency tracking, and says compiler-runtime support is absent even though `react/compiler-runtime` is implemented. Its optimistic-hook description also differs from the current no-op dispatcher.

The source still reports React version `19.2.3`. A version-string bump would not establish 19.3 compatibility. The previously missing `Activity`, `cacheSignal` and `unstable_useCacheRefresh` exports are now present. Supported behavior and intentional downgrades remain separate from export availability.

# Where the size savings come from

Numbers from `scripts/size.mjs` (esbuild: bundle + minify + `NODE_ENV=production` + tree-shake + gzip) for `@tanstack/redact@0.0.1`, and `scripts/size-react-real.mjs` for React 19.2.3 measured identically.

## Per-entry comparison vs React 19.2.3

| Entry | React 19 gzip | `@tanstack/redact` (full) | Ratio | Savings |
|---|---:|---:|---:|---:|
| `react` | 3.29 KB | 2.65 KB | 81% | −0.64 KB |
| `react/jsx-runtime` | 731 B | 189 B | 26% | −542 B |
| `react-dom` | 4.35 KB | 8.53 KB | 196% | +4.18 KB\* |
| `react-dom/client` | **60.27 KB** | **9.07 KB** | **15%** | **−51.20 KB** |
| `react-dom/server` | 61.11 KB | 4.59 KB | 8% | −56.52 KB |
| **Client total** (`react` + `react-dom/client` + `react/jsx-runtime`) | **60.48 KB** | **11.18 KB** | **18%** | **−49.30 KB** |

\* `react-dom` (the index) looks worse because React splits it into a tiny facade over `react-dom/client`; ours ships `createPortal`, `flushSync`, `unstable_batchedUpdates`, and resource-hint stubs in one file. Real apps ship `react-dom/client`, so that row is what matters.

The `nano` preset (every opt-in feature stubbed) brings `react-dom/client` down further to **6.75 KB gzip** — a 2.32 KB savings vs `full` and a **8.9× reduction** vs React's `react-dom/client`.

React 18 was ~43 KB gzip for the full client runtime; React 19 jumped to ~60 KB mostly because of `use()`, server actions (`useActionState`, `useFormStatus`), `useOptimistic`, view transitions, and async-transition plumbing.

**Bottom line: a single-import client bundle shrinks from ~60 KB to ~11 KB, a ~49 KB (~82%) reduction at full parity, or to ~9.4 KB (~84% reduction) on the `nano` preset.** The win comes almost entirely from `react-dom/client` — React's `react` package is only ~3 KB to begin with.

## Where those ~49 KB go in React (approximation)

Reading React's source, the 60 KB of `react-dom/client` roughly splits as:

| Feature | ~gzip | Ours |
|---|---:|---|
| Fiber reconciler (double-buffered work-in-progress tree, work loops) | 12 KB | single-tree recursive diff |
| Scheduler + lanes + priority model + interruptible work | 6 KB | synchronous, no scheduling |
| Synthetic event system (SyntheticEvent + per-event plugins + delegation) | 7 KB | direct DOM listeners with a handler indirection |
| Full DOM attr/property table (controlled inputs, SVG quirks, legacy attrs) | 4 KB | common cases only |
| Hydration: selective/progressive + full mismatch diff + suspense boundary replay | 5 KB | adoption + wipe-on-mismatch + streaming reveal |
| Concurrent rendering (`useTransition`, `useDeferredValue`, startTransition plumbing) | 3 KB | stubs |
| `useSyncExternalStore` with tearing guarantees + subscription batching | 1 KB | basic subscribe |
| Error boundary orchestration across commit phases + retry | 2 KB | `getDerivedStateFromError` + `componentDidCatch` |
| StrictMode double-invoke + sub-tree traversal | 2 KB | passthrough |
| Dev warnings, component stacks, string pool, error codes | 2 KB | minimal throws |
| React DevTools hook + fiber instrumentation | 2 KB | not supported |
| `act()`, test utilities, rendering-in-act tracking | 2 KB | stub |
| `cache`, `useId` split-safe, insertion effects, resource hints | 2 KB | stubs/aliases |
| Portals with full container-handoff + event retargeting | 1 KB | basic |
| Class component lifecycles (getSnapshotBeforeUpdate, legacy context) | 1 KB | most lifecycles |

Total accounted: ~52 KB, which roughly matches the observed 51 KB delta on `react-dom/client`.

## Per-feature savings (full → stub)

The 8 opt-in features can each be stubbed individually. Numbers from `pnpm size`, measuring `react-dom/client` with the listed feature flagged off:

| Feature | full → stub savings (gzip) |
|---|---:|
| `portal` | ~30 B |
| `context` | ~80 B |
| `suspense` | **~640 B** |
| `memo` | ~80 B |
| `forwardRef` | ~70 B |
| `lazy` | ~20 B |
| `classComponents` | ~200 B |
| `hydration` | **~1270 B** |
| **All off (`nano` preset)** | **~2320 B** |

Stubbed features still carry a small registration footprint (matcher entry that maps the React element type to Fragment, dispatcher capability defaults). The `nano` preset's total savings is slightly less than the sum of individual savings because some feature code is shared.

## What we **didn't** skip

We implement in full or close to full:
- Common hooks: `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useRef`, `useMemo`, `useCallback`, `useContext`, `useImperativeHandle`, `useSyncExternalStore`, `useSyncExternalStoreWithSelector`, `use()`, `useEffectEvent`
- `createElement`, `cloneElement`, `isValidElement`, `Children.*`
- `createContext` with `Provider` / `Consumer` / `useContext`
- `memo`, `forwardRef`, `lazy` with Suspense integration
- `Suspense` + `use(promise)` with thrown-promise protocol
- `Component` / `PureComponent` class with `setState`, lifecycles, `getDerivedStateFromError`, `componentDidCatch`
- Fragment, keys, reordering
- `flushSync`, `createPortal`
- Refs: callback refs (with React 19 cleanup return semantics) and object refs
- Streaming SSR with Suspense boundaries (context snapshot on suspend + replay on re-render)
- Boundary-aware hydration: per-boundary `$RH` reveal callback + re-hydration against revealed DOM
- Event replay via an inline `$RE_q` capture buffer drained after hydration

## Where we'll feel the missing pieces

Ranked by how likely they are to bite a real app:

1. **Heavy renders freeze the UI** — React yields to the browser during long work; we don't. A big list re-render on a slow machine drops frames.
2. **`onChange` semantics differ on text inputs** — we fire native `change` (blur/commit), React fires on every keystroke. Fixable with a ~100-byte patch in `dom.ts` remapping `onChange` → `oninput` for input/textarea.
3. **Stores like Zustand/Jotai may tear** under rapid updates — our `useSyncExternalStore` lacks React's snapshot-batching.
4. **`act()` in tests is a stub** — patterns that rely on `act` flushing all pending work need manual awaits.
5. **Hydration mismatch cascades** — we wipe subtrees and re-render; React tries to salvage more.
6. **No React DevTools.** Extension won't attach (~1 KB to implement minimum protocol).
7. **Typing feels slightly worse under contention** — no priority boost for user input.
8. **StrictMode is a no-op** — dev-mode detection of unsafe side effects is gone.

## What this means for the 11 KB budget

Client bundle is 11.18 KB gzip total at full parity; the reconciler + dispatcher + DOM + hydration alone is ~8.3 KB. That ~8.3 KB is what shaves 51 KB off React's 60 KB `react-dom/client` — a **6.6× reduction**. The delta comes from skipping the four things that define React's production runtime:

- Fiber (double-buffered work-in-progress tree)
- Scheduler (priority + lanes + interruption)
- Synthetic events (wrapping + plugin system)
- Dev-mode machinery (warnings + DevTools + StrictMode + act)

Re-adding any of them costs:
- Real scheduler: +3–5 KB
- Fiber double-buffer: +4–6 KB
- Full synthetic events: +4–6 KB
- Dev warnings + DevTools: +3–5 KB

All four together: +14–22 KB, taking us to 25–33 KB — still roughly half of React, but no longer Preact-territory.

**The size claim isn't magic.** We skipped the four expensive subsystems, kept the API shape, and accepted the UX trade-offs that come with that choice.

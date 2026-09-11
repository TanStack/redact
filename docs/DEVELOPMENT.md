# Configuration and internals

For setup, measured comparisons, compatibility, and feature behavior, start with the [README](../README.md).

## Vite options

```ts
interface RedactOptions {
  preset?: 'nano' | 'full'
  features?: {
    activity?: boolean
    fragmentRefs?: boolean
    viewTransitions?: boolean
    portal?: boolean
    context?: boolean
    suspense?: boolean
    memo?: boolean
    forwardRef?: boolean
    lazy?: boolean
    classComponents?: boolean
    hydration?: boolean
  }
  skip?: ReadonlyArray<string>
  resolveFrom?: string
  packageRoots?: Record<string, string>
}
```

- `preset` defaults to `full`, which enables every optional feature except native ViewTransition animation. `nano` disables all optional features.
- `features` overrides individual preset values. See the [disabled-feature table](../README.md#feature-flags) before removing behavior.
- `skip` leaves exact import specifiers out of the alias map. It is not a way to mix React hooks into a Redact component tree.
- `resolveFrom` changes the consumer resolution root, useful in monorepos.
- `packageRoots` maps package names to absolute package directories for cross-workspace testing. For example, use an `@tanstack/redact` key pointing to a built local package.

The plugin aliases client and SSR environments, deduplicates Redact, keeps it inside SSR bundles, and prevents React from being prebundled alongside it. It skips the RSC environment so upstream React owns Flight serialization. Keep all Redact subpaths on one canonical package copy rather than mixing source and dist.

The source of truth is [the Vite plugin](../packages/redact/src/vite/index.ts), with [consumer/build tests](../tests/vite-plugin.test.ts) and [built-package verification](../scripts/verify-build.mjs).

## Other bundlers

Redact exposes React-shaped subpath entries and `./features/*` modules. A non-Vite integration needs to reproduce both React-entry aliasing and any desired feature selection. A bare package alias does not replace relative imports inside the renderer.

Each feature has `index`, `full`, and `stub` modules:

```text
@tanstack/redact/features/
  activity/ fragment-refs/ view-transition/ portal/ context/ suspense/
  memo/ forward-ref/ lazy/ class/ hydration/
    index
    full
    stub
```

Direct feature indexes select `full`. Direct DOM entrypoints therefore include native animation support; the default Vite plugin explicitly selects its stub. Prebuilt `dom/nano/client` preset entrypoints are not available.

A bundler integration must:

1. Alias React, JSX, compiler-runtime, DOM, server, scheduler, and relevant external-store shims to one Redact package. The exact map is in the Vite implementation.
2. Redirect disabled features when `dom/features/index` imports their indexes. Source imports use paths such as `./portal`; built imports use `./portal/index.js`.
3. Apply the same selection to peer imports of context, hydration, Fragment refs, and ViewTransition. Otherwise an enabled feature can bring a disabled implementation back into the bundle.
4. Keep environment boundaries intact, particularly the upstream RSC environment.
5. Check the output graph. Disabled `features/<name>/full.js` modules must be absent, not merely overridden after registration.

On-disk names differ from option keys for `forward-ref` / `forwardRef`, `fragment-refs` / `fragmentRefs`, `view-transition` / `viewTransitions`, and `class` / `classComponents`.

`npm:` dependency aliases can replace a package name but cannot map `react-dom` to Redact's `./dom` subpath. They are not a complete substitute for the Vite plugin or equivalent bundler integration. The Vite path is the one exercised by the packaged real-site checks.

## Runtime extension points

`@tanstack/redact/_all` exposes the renderer and registration primitives used by the built-in features:

```ts
import {
  registerRenderer,
  registerTypeMatcher,
  registerElementMarker,
  installCapability,
  reconcileChildren,
  childrenToArray,
  FiberTag,
  type Fiber,
  type RenderFn,
  type TypeMatcher,
  type Capabilities,
} from '@tanstack/redact/_all'
```

`registerRenderer` selects a renderer for a fiber tag. `registerTypeMatcher` adds element-type matching, and `registerElementMarker` extends accepted element markers. `installCapability` supplies cross-cutting behavior such as Suspense handling or context reads. These are implementation extension points, not React's public API.

Features register at module load. Registration order matters, so importing a stub after a full implementation is not equivalent to removing the full implementation from the build. Use the existing feature pairs and [reconciler types](../packages/redact/src/dom/reconcile.ts) when extending the runtime; commit, rollback, and retained-tree behavior must remain consistent.

## Source and build layout

```text
packages/redact/src/
  core/          Shared element, fiber, and hook types
  react/         React API, hooks, JSX, and compiler runtime
  dom/           Reconciliation, commits, host DOM, roots, and portals
    features/    Selectable index/full/stub modules
  server/        String, readable-stream, and pipeable-stream rendering
  scheduler/     Synchronous-runtime scheduler shim
  vite/          Environment-aware aliases and feature selection
tests/           Unit, integration, and browser parity suites
benchmarks/      Fixtures, frozen inputs, raw results, and audits
```

The build emits each TypeScript module separately, with explicit relative ESM paths and matching NodeNext declarations. It preserves module boundaries for feature selection and leaves the development/production choice to the consumer's build.

```bash
pnpm install
pnpm build                    # emit modules/types and verify the built package
pnpm test                     # unit and integration suite
pnpm test:types
pnpm test:ci                  # full ordinary release gate
pnpm size                     # built-package entry/feature sizes
pnpm size:check               # source and built-package budgets
pnpm --filter ssr-demo dev
```

`SIZE_TREE=src pnpm size` measures source entries instead of dist. Source and built-package results are distinct; do not substitute one for the other in comparisons. Separate browser/site gates and benchmark commands are in the [ship review](../benchmarks/SHIP_RESULTS.md#reproduce). Do not run timings alongside tests, builds, or other browser jobs.

## Early release history

This history describes older releases, not the current sizes or compatibility. The first nine alpha versions used separate `@tanstack/react`, `@tanstack/react-dom`, `@tanstack/react-dom-server`, `@tanstack/dom-core`, `@tanstack/scheduler`, and `@tanstack/dom-vite` packages (`0.1.0-alpha.0` through `0.1.0-alpha.9`). They were replaced by the single `@tanstack/redact` package with subpath exports.

- `@tanstack/redact@0.0.1`: consolidated the six packages and renamed `tanstackDom()` to `redact()`. Shared internals used a `globalThis` singleton to defend against duplicate package copies. Export snapshots guarded the named-export surface.
- `react@0.1.0-alpha.8`: added `useEffectEvent`, with a stable callback refreshed through insertion effects.
- `react-dom@0.1.0-alpha.8`: introduced eight feature flags, full/stub pairs, typed Vite configuration, and size budgets. At that historical point, nano measured 6.75 KB gzip.
- `react-dom@0.1.0-alpha.5`: moved effect cleanup to effect-run time so coalesced renders did not leak intermediate side effects.
- `react-dom@0.1.0-alpha.4`: fixed duplicate markup when lazy content hydrated inside ancestor Suspense.
- `react-dom-server@0.1.0-alpha.4`: buffered the shell and bootstrap into fewer stream writes.

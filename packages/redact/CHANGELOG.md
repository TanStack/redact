# @tanstack/redact

## 0.1.2

### Patch Changes

- Fix updates from undefined state so refs and layout effects commit correctly, including animated dialog cleanup. Match React's TypeScript overload for calling `useState()` without an initial value. Process pending parent updates before propagating context to prevent stale route matches during navigation. ([#33](https://github.com/TanStack/redact/pull/33))

## 0.1.1

### Patch Changes

- Support React 19's direct context provider syntax (`<Context value={value}>`) on the client and server, including hydration. `Context.Provider` is now the context itself, so switching between the two forms preserves component state. ([#29](https://github.com/TanStack/redact/pull/29))

  Keep `ref` in the props returned by `createElement` and `cloneElement`, including refs passed through function components and render-prop triggers. Cloning with an undefined ref preserves the original ref.

  Use explicit reserved-key checks when copying props. This also preserves own props named `constructor`, `toString`, or `hasOwnProperty`.

## 0.1.0

### Minor Changes

- Add React 19.3 APIs and improve runtime compatibility while keeping Redact's synchronous rendering contract. ([#24](https://github.com/TanStack/redact/pull/24))

  - Add state-preserving Activity boundaries, Fragment refs, browser rendering boundaries, and cache API compatibility. Native ViewTransition animation and transition types are experimental and opt-in through the Vite plugin.
  - Fix effect and ref ordering, retained Suspense and Activity updates, reducer queues, error boundaries, controlled inputs, hydration recovery, and document and ShadowRoot resource ownership.
  - Reduce unnecessary reconciliation and effect work, and harden server rendering, streaming, cancellation, and nonce handling.
  - Fix native ESM and declaration imports, shared dispatcher identity, environment-sensitive builds, and Vite feature selection in the published package.
  - Document measured bundle sizes, React performance comparisons, and the supported APIs and intentional synchronous downgrades in the README.

  Concurrent scheduling is still not implemented. Action and optimistic hooks retain their documented no-op behavior, and native animations remain disabled by default.

## 0.0.21

### Patch Changes

- Retire abandoned hydration trees before client recovery so old effects, subscriptions, refs, and class lifecycles cannot mount duplicate UI. Preserve the document shell and remove portals owned by the discarded tree. ([#22](https://github.com/TanStack/redact/pull/22))

## 0.0.20

### Patch Changes

- Preserve muted audio and video during hydration, and handle enumerated attribute values consistently across server rendering, hydration, and DOM updates. ([#20](https://github.com/TanStack/redact/pull/20))

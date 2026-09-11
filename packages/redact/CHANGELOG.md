# @tanstack/redact

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

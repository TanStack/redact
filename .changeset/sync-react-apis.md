---
'@tanstack/redact': minor
---

Add React 19.3 APIs and improve runtime compatibility while keeping Redact's synchronous rendering contract.

- Add state-preserving Activity boundaries, Fragment refs, browser rendering boundaries, and cache API compatibility. Native ViewTransition animation and transition types are experimental and opt-in through the Vite plugin.
- Fix effect and ref ordering, retained Suspense and Activity updates, reducer queues, error boundaries, controlled inputs, hydration recovery, and document and ShadowRoot resource ownership.
- Reduce unnecessary reconciliation and effect work, and harden server rendering, streaming, cancellation, and nonce handling.
- Fix native ESM and declaration imports, shared dispatcher identity, environment-sensitive builds, and Vite feature selection in the published package.
- Document measured bundle sizes, React performance comparisons, and the supported APIs and intentional synchronous downgrades in the README.

Concurrent scheduling is still not implemented. Action and optimistic hooks retain their documented no-op behavior, and native animations remain disabled by default.

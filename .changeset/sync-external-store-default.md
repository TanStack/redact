---
'@tanstack/redact': patch
---

Put `useSyncExternalStoreWithSelector` on the default export. The Vite plugin aliases `use-sync-external-store/shim/with-selector` here, and zustand reads it as a CJS default import (`import shim from '...'; const { useSyncExternalStoreWithSelector } = shim`), so anything built on zustand's `useStoreWithEqualityFn` — React Flow, for one — threw `useSyncExternalStoreWithSelector is not a function`.

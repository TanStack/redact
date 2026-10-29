---
'@tanstack/redact': patch
---

Alias `use-sync-external-store/shim/index.js` and `use-sync-external-store/index.js` in the Vite plugin. Libraries such as react-aria import the explicit file subpath, which previously fell through to the raw CJS shim in dev and failed with "does not provide an export named 'useSyncExternalStore'".

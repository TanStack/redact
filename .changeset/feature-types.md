---
'@tanstack/redact': minor
---

Report TypeScript errors where code uses a feature that `redact()` disables. The Vite plugin writes `src/redact.gen.d.ts`, which references one declaration file per disabled feature. Each file merges into `@types/react` and `@types/react-dom`, so `<Suspense>`, `<Activity>`, context providers, `forwardRef()`, `lazy()` components, `createPortal()`, `hydrateRoot()`, and class lifecycle methods fail type-checking when their feature is off. Editors show `memo()` and `addTransitionType()` as deprecated when their feature is off. Set the new `dts` option to change the file path, or to `false` to skip the file.

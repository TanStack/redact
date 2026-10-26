# Feature types example

This app turns off every optional Redact feature and uses each one anyway, so TypeScript reports an error at each use.

The app keeps `react`, `react-dom`, `@types/react`, and `@types/react-dom` installed. The `redact()` plugin writes `src/redact.gen.d.ts`. That file references one declaration file per disabled feature, and each one declaration-merges into React's types.

## Run it

From the repository root:

```sh
pnpm install
pnpm build
```

From this directory:

```sh
pnpm build      # writes src/redact.gen.d.ts from vite.config.ts
pnpm typecheck  # reports the errors and exits with code 2
pnpm dev        # shows what each stub does at runtime
```

## Expected errors

| File | Error |
| --- | --- |
| `context.tsx` | `<Theme value>` and `<Theme.Provider value>`. Reading the default with `useContext` passes. |
| `suspense.tsx` | `<Suspense>` |
| `activity.tsx` | `<Activity>` |
| `forward-ref.tsx` | The `forwardRef()` call. A `ref` prop passes. |
| `lazy.tsx` | `<LazyPanel />` |
| `portal.tsx` | `{createPortal(...)}` |
| `hydration.tsx` | Using the root that `hydrateRoot()` returns |
| `class-components.tsx` | `componentDidMount`, `static getDerivedStateFromError`, and rendering `<MountStatus />`. A class with only `render`, `setState`, and `componentWillUnmount` passes. |

`memo.tsx` and `view-transitions.tsx` have no errors, because those features only change performance or animation. Editors show `memo()` and `addTransitionType()` as deprecated instead. `lazy()`, `createPortal()`, and `hydrateRoot()` are also shown as deprecated.

`fragmentRefs` has no type check.

## Turn a feature back on

1. In `vite.config.ts`, set a feature to `true`, for example `context: true`.
2. Run `pnpm build` or `pnpm dev`. The plugin rewrites `src/redact.gen.d.ts`.
3. Run `pnpm typecheck`. The errors for that feature are gone.

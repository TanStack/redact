---
title: Vite Plugin Reference
---

```ts
import { redact } from '@tanstack/redact/vite'

redact({
  preset: 'full',
  features: { viewTransitions: false },
})
```

## Options

| Option | Type | Behavior |
| --- | --- | --- |
| `preset` | `'full'` or `'nano'` | Defaults to `full`. Full enables every optional feature except native animation. Nano disables all optional features. |
| `features` | `RedactFeatures` | Boolean overrides merged with the preset. See [Feature Flags](./feature-flags.md). |
| `dts` | `boolean` or `string` | Defaults to `true`, which writes `src/redact.gen.d.ts` under the Vite root when `src/` exists. The file makes TypeScript report errors where your code uses a disabled feature. Pass a path relative to the root to change the file, or `false` to skip it. Your tsconfig must include the file. |
| `skip` | `ReadonlyArray<string>` | Import specifiers to exclude from aliasing. |
| `resolveFrom` | `string` | Package resolution root, defaults to the Vite config root. Useful in monorepos. |
| `packageRoots` | `Record<string, string>` | Explicit package names mapped to absolute package directories, bypassing node_modules lookup for local builds. |

## Import aliases

The plugin redirects React, JSX runtimes, React Compiler runtime, React DOM, DOM client, server rendering, scheduler, and use-sync-external-store entrypoints to Redact. Your application's React imports stay unchanged.

The RSC environment remains on upstream React, Redact does not implement Flight serialization.

For the exact alias map and resolution behavior, see the [plugin source](https://github.com/TanStack/redact/blob/main/packages/redact/src/vite/index.ts). The [development guide](https://github.com/TanStack/redact/blob/main/docs/DEVELOPMENT.md) covers runtime internals.

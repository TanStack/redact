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
| `environments` | `ReadonlyArray<'client' \| 'ssr'>` | Defaults to both. Use `['client']` to keep native React for SSR, or `['ssr']` to keep it in the browser. |
| `skip` | `ReadonlyArray<string>` | Import specifiers to exclude from aliasing. |
| `resolveFrom` | `string` | Package resolution root, defaults to the Vite config root. Useful in monorepos. |
| `packageRoots` | `Record<string, string>` | Explicit package names mapped to absolute package directories, bypassing node_modules lookup for local builds. |

## Import aliases

The plugin redirects React, JSX runtimes, React Compiler runtime, React DOM, DOM client, server rendering, scheduler, and use-sync-external-store entrypoints to Redact. Your application's React imports stay unchanged.

The RSC environment remains on upstream React, Redact does not implement Flight serialization.

## React Router framework mode

Select only the browser runtime alongside React Router's Vite plugin:

```ts
import { reactRouter } from '@react-router/dev/vite'
import { redact } from '@tanstack/redact/vite'

export default {
  plugins: [redact({ environments: ['client'] }), reactRouter()],
}
```

The server keeps native React. Use the hydration ID setup below in the client entry, including the same `identifierPrefix` when the server sets one. Maintained framework release checks are tracked in [#88](https://github.com/TanStack/redact/issues/88).

## Native React for SSR

Select the browser environment when the server should keep React:

```ts
redact({ environments: ['client'] })
```

When hydrating HTML from native React, select its ID strategy in the client entry so `useId()` matches the server:

```tsx
import { hydrateRoot } from '@tanstack/redact/dom-client'

hydrateRoot(document, <App />, { identifierStrategy: 'react' })
```

When the native server sets `identifierPrefix`, pass the same prefix to `hydrateRoot`. A matching prefix does not replace the `identifierStrategy: 'react'` option.

Redact's `RootOptions` type from `@tanstack/redact/dom-client` includes `identifierStrategy`. With the default environment selection, both client and server use Redact and this option is unnecessary.

For the exact alias map and resolution behavior, see the [plugin source](https://github.com/TanStack/redact/blob/main/packages/redact/src/vite/index.ts). The [development guide](https://github.com/TanStack/redact/blob/main/docs/DEVELOPMENT.md) covers runtime internals.

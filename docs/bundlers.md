# Webpack, Rspack and Rsbuild

These plugins target browser SPAs. Server builds, React Server Components and hot reload are not supported by this integration yet. Use `target: 'web'`, compile JSX as usual, and install React alongside Redact so the plugin can select the React 18 or React 19 element protocol.

## Webpack 5

```js
import { redact } from '@tanstack/redact/webpack'

export default {
  target: 'web',
  plugins: [redact()],
}
```

## Rspack 2

```js
import { redact } from '@tanstack/redact/rspack'

export default {
  target: 'web',
  plugins: [redact()],
}
```

## Rsbuild 2

Add the Rspack plugin through Rsbuild's config hook:

```js
import { defineConfig } from '@rsbuild/core'
import { redact } from '@tanstack/redact/rspack'

export default defineConfig({
  output: { target: 'web' },
  tools: {
    rspack(config) {
      config.plugins ??= []
      config.plugins.push(redact())
    },
  },
})
```

Keep your existing JSX compiler or Rsbuild React plugin. Redact changes runtime resolution, it does not compile JSX.

## Options

The plugins use the Vite integration's `preset`, `features`, `skip`, `resolveFrom` and `packageRoots` options. `redact()` uses the full preset, with experimental view transitions off. For a smaller SPA bundle, opt into the features your app uses:

```js
redact({ preset: 'nano', features: { context: true, suspense: true } })
```

Disabling a feature changes behavior, see the feature descriptions in the exported types. `skip` leaves the named import untouched, mixing React and Redact elements or hooks requires care. In a monorepo, `resolveFrom` identifies the application directory containing React. `packageRoots` can select a built Redact package explicitly.

Aliases match exact public entrypoints. Feature replacement is limited to that selected package's canonical files, including symlinked installations, and preserves resource queries. Application modules with similar names are left alone. The React 18 loader parses only the selected runtime's published JavaScript and keeps source maps.

`react-dom/profiling` uses the Redact DOM and root exports. It does not provide React's profiling instrumentation. Use React when that instrumentation is required.

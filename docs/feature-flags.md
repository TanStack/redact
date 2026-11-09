---
title: Feature Flags
---

`redact()` uses the `full` preset: all optional features enabled **except native animation**. Turn off only behavior your app does not need:

```ts
redact({ features: { hydration: false, classComponents: false } })
redact({ features: { viewTransitions: true } }) // experimental animation
redact({ preset: 'nano', features: { context: true } })
```

`nano` starts with every optional feature off. Overrides merge with the preset. Feature savings overlap and are not additive.

<details>
<summary>What each disabled feature removes</summary>

| Flag | Behavior when `false` |
|---|---|
| `svgAttributeAliases` | Use canonical SVG names such as `text-anchor`. Development reports React aliases such as `textAnchor` and explains how to enable them. |
| `activity` | Hidden children unmount and lose state. |
| `fragmentRefs` | No Fragment DOM instance. |
| `viewTransitions` | No native snapshots or animation callbacks; the boundary retains state. |
| `portal` | Children render in place, not into the target container. |
| `context` | Providers do not propagate values; reads return the default. |
| `suspense` | No fallback UI; thrown thenables still retry on settlement. |
| `memo` | No prop-equality bailout. |
| `forwardRef` | No wrapper forwarding; ordinary ref props still work. |
| `lazy` | Only already-synchronous payloads resolve. |
| `classComponents` | Constructor, render, and setState only; no lifecycles or error boundaries. |
| `hydration` | `hydrateRoot` throws; use `createRoot`. |

</details>

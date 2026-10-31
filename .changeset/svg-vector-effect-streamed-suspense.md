---
'@tanstack/redact': patch
---

Map `vectorEffect` to `vector-effect` so it takes effect and no longer fails hydration, and keep SVG attribute casing, namespace and position for Suspense boundaries streamed directly inside `<svg>`.

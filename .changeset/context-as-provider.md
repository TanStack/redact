---
'@tanstack/redact': patch
---

Render a context as its own provider, matching React 19's `<Ctx value={v}>` form.

The reconciler only recognized `react.provider`-tagged types, so a context object used directly as an element type fell through to the host branch and threw `InvalidCharacterError: The tag name provided ('[object Object]') is not a valid name`. Server rendering silently dropped the provider's subtree for the same reason. Both forms now resolve to the same context, and `Context<T>` is callable in JSX.

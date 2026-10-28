---
'@tanstack/redact': patch
---

Subscribe to thenables that arrive with a status of their own, as React's `use()` does. React's Flight chunks (`resolved_model`, `blocked`, ...) only initialize or settle once subscribed, so a Server Component promise read with `use()` or rendered as a child was thrown instead of read, and Next.js hydration replaced the server DOM. The fix adds no bytes to the default Vite client total.

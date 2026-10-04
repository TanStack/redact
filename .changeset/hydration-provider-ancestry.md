---
'@tanstack/redact': patch
---

Keep component and context provider ancestry when recovering from a hydration mismatch. Document recovery preserves the existing shell, root renders still update the full app, and abandoned effects are cleaned up.

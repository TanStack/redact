---
'@tanstack/redact': patch
---

Retire abandoned hydration trees before client recovery so old effects, subscriptions, refs, and class lifecycles cannot mount duplicate UI. Preserve the document shell and remove portals owned by the discarded tree.

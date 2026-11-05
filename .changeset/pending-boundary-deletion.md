---
"@tanstack/redact": patch
---

Remove opaque pending server ranges when their Suspense boundary is deleted and ignore obsolete reveal callbacks.

Release pending reveal subscriptions with their boundary range and remove late transport segments whose boundary was deleted.

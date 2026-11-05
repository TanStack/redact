---
'@tanstack/redact': patch
---

Write streamed SSR output when the destination starts reading, as React does. Suspense boundaries that complete before then are inlined, so a reader that waits for `allReady` gets a complete document that renders without JavaScript. Only boundaries still pending at that point stream a hidden segment and reveal script.

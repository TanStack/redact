---
'@tanstack/redact': patch
---

Adopt server-rendered metadata that remains in the document body during hydration. This prevents React Router's production module-preload links from triggering body replacement and preserves the existing interactive DOM.

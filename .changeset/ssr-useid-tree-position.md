---
'@tanstack/redact': patch
---

Derive server useId values from tree positions so suspended boundaries hydrate without changing IDs, and keep hydrated IDs separate from IDs allocated by later client mounts.

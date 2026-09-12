---
'@tanstack/redact': patch
---

Fix updates from undefined state so refs and layout effects commit correctly, including animated dialog cleanup. Match React's TypeScript overload for calling `useState()` without an initial value. Process pending parent updates before propagating context to prevent stale route matches during navigation.

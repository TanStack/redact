---
'@tanstack/redact': patch
---

Restore a controlled input, textarea, select, checkbox or radio that has no `onChange` handler, so it stays read-only as in React. Clicking a controlled radio without `onChange` also restores the rest of its group. ([#115](https://github.com/TanStack/redact/issues/115))

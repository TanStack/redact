---
'@tanstack/redact': patch
---

Copy non-enumerable Event fields into synthetic events. DOM implementations such as happy-dom define `type`, `target`, `currentTarget` and `composedPath` as non-enumerable accessors, so handlers saw them as `undefined` and controlled inputs never read `e.target.value` in happy-dom test suites.

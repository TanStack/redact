---
'@tanstack/redact': patch
---

Call `onChange` for a checkbox or radio clicked in a container that is not in the document, and restore it when controlled, as React does. Browsers fire no `change` event there.

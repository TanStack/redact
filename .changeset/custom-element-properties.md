---
'@tanstack/redact': patch
---

Assign custom element props as properties, the way React 19 does

A prop on a tag whose name contains a dash is now set as a property when the
element declares one, and only falls back to an attribute otherwise. Object and
function values reach web components intact instead of being stringified into
`[object Object]`, so a component that reads its data from a property (for
example `<number-flow-react data={…}>`) updates on every render rather than only
on mount.

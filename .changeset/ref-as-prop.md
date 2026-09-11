---
'@tanstack/redact': patch
---

Keep `ref` in props for `createElement` and `cloneElement`, matching React 19's ref-as-prop behavior. Libraries that clone an element with a merged ref (Base UI's `render` prop, for example) lost the ref entirely, so the cloned function component never received it and ref-dependent behavior — tooltips, popovers, anything anchored to a trigger — silently never activated.

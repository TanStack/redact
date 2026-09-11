# @tanstack/redact

## 0.0.21

### Patch Changes

- Retire abandoned hydration trees before client recovery so old effects, subscriptions, refs, and class lifecycles cannot mount duplicate UI. Preserve the document shell and remove portals owned by the discarded tree. ([#22](https://github.com/TanStack/redact/pull/22))

## 0.0.20

### Patch Changes

- Preserve muted audio and video during hydration, and handle enumerated attribute values consistently across server rendering, hydration, and DOM updates. ([#20](https://github.com/TanStack/redact/pull/20))

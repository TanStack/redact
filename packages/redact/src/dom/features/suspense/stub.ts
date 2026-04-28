import { FiberTag } from '../../../core'
import { REACT_SUSPENSE_TYPE } from '../../../react'
import { registerTypeMatcher } from '../../reconcile'

// Stub: Suspense feature disabled. `<Suspense>` elements render as Fragments
// — children mount inline and `fallback` is ignored. Thrown thenables in
// descendants fall through to the default `handleSuspended` capability
// (in reconcile.ts), which schedules a re-render when the promise settles.
// Eventual consistency still works; there's just no fallback UI during the
// pending window. Boundary-handler stack, streaming hydration integration,
// and fallback-swap logic are all stripped.
registerTypeMatcher((type) => (type === REACT_SUSPENSE_TYPE ? FiberTag.Fragment : null))

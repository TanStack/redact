import { FiberTag } from '../../../core'
import { REACT_PORTAL_TYPE } from '../../../react'
import { registerTypeMatcher, registerElementMarker } from '../../reconcile'

// Stub: Portal feature disabled. Portal elements still flow through JSX
// (otherwise they'd be silently dropped by child normalization), but render
// in place as a Fragment — the `container` prop is ignored. No Portal
// renderer is registered, so the `renderPortal` function and its deps don't
// ship in builds that select this stub.
registerElementMarker(REACT_PORTAL_TYPE)
registerTypeMatcher((type) => (type === REACT_PORTAL_TYPE ? FiberTag.Fragment : null))

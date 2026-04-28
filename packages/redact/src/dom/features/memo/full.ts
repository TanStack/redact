import { FiberTag, type Fiber } from '../../../core'
import {
  REACT_FORWARD_REF_TYPE,
  REACT_MEMO_TYPE,
  REACT_LAZY_TYPE,
} from '../../../react'
import {
  registerRenderer,
  registerTypeMatcher,
  renderFiber,
  getForceRerenderingFiber,
} from '../../reconcile'

function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (a[k] !== b[k]) return false
  }
  return true
}

function renderMemo(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  const { type, compare } = fiber.type as any
  const props = fiber.pendingProps ?? {}
  const prev = fiber.memoizedProps

  // Memo's prop-equality gate guards PARENT-triggered rerenders. If this
  // render is a STATE-triggered rerender of this exact fiber (hook update,
  // useSyncExternalStore notification), props haven't changed by definition —
  // bailing would swallow the state change and the subscriber never re-runs.
  // rerenderFiber tags the fiber so we skip the gate here.
  const bypassMemo = fiber === getForceRerenderingFiber()
  const eq = !bypassMemo && prev && (compare ? compare(prev, props) : shallowEqual(prev, props))
  if (eq) {
    // Re-render children with previous output (already in tree)
    return
  }

  // Determine the delegated tag based on the memoized type. `React.memo` can
  // wrap plain functions, class components, OR other special types like
  // `forwardRef`. Without the marker-based branch we'd mistreat
  // `memo(forwardRef(...))` as a Fragment and render nothing.
  let innerTag: FiberTag
  if (typeof type === 'function') {
    innerTag = type.prototype?.isReactComponent ? FiberTag.Class : FiberTag.Function
  } else if (type && typeof type === 'object') {
    const m = (type as any).$$typeof
    if (m === REACT_FORWARD_REF_TYPE) innerTag = FiberTag.ForwardRef
    else if (m === REACT_MEMO_TYPE) innerTag = FiberTag.Memo
    else if (m === REACT_LAZY_TYPE) innerTag = FiberTag.Lazy
    else innerTag = FiberTag.Fragment
  } else {
    innerTag = FiberTag.Fragment
  }

  // Swap tag and type for this render pass; this is a "delegating" render
  const savedTag = fiber.tag
  const savedType = fiber.type
  fiber.tag = innerTag
  fiber.type = type
  try {
    renderFiber(fiber, domParent, anchor)
  } finally {
    fiber.tag = savedTag
    fiber.type = savedType
  }
}

registerTypeMatcher((_type, marker) => (marker === REACT_MEMO_TYPE ? FiberTag.Memo : null))
registerRenderer(FiberTag.Memo, renderMemo)

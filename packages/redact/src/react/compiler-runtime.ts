// React Compiler runtime — emitted code calls `c(size)` to obtain a
// per-component-instance memo cache. Each slot starts as a sentinel; the
// compiled code overwrites slots with computed values and uses sentinel
// identity to detect first-run / dependency-change.
//
// The cache must persist across renders of the same fiber, so we lean on
// `useRef`. Slots are filled with the canonical
// `Symbol.for('react.memo_cache_sentinel')` so any tooling that compares
// against the same well-known symbol stays interoperable.
import { useRef } from './hooks'

const MEMO_CACHE_SENTINEL = Symbol.for('react.memo_cache_sentinel')

export function c(size: number): Array<unknown> {
  const ref = useRef<Array<unknown> | null>(null)
  if (ref.current === null) {
    const arr = new Array<unknown>(size)
    for (let i = 0; i < size; i++) arr[i] = MEMO_CACHE_SENTINEL
    ref.current = arr
  }
  return ref.current
}

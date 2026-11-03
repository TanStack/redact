import { useMemo } from './hooks'

const MEMO_CACHE_SENTINEL = Symbol.for('react.memo_cache_sentinel')

// Memo dependencies are invalidated by Fast Refresh while component state survives.
export function c(size: number): Array<unknown> {
  return useMemo(() => new Array<unknown>(size).fill(MEMO_CACHE_SENTINEL), [size])
}

import { unstable_batchedUpdates } from '@tanstack/redact/dom'

// Compile-only checks for inferred results and the existing explicit generic.
export function batchingTypes() {
  const inferred: number = unstable_batchedUpdates((value: number) => value + 1, 2)
  const explicit: number = unstable_batchedUpdates<number>(() => 3)
  const optional: number = unstable_batchedUpdates((value?: number) => value ?? 3)
  // @ts-expect-error A required callback argument needs a matching value.
  unstable_batchedUpdates((value: number) => value, 'wrong')
  // @ts-expect-error A required callback argument cannot be omitted.
  unstable_batchedUpdates((value: number) => value)
  return [inferred, explicit, optional]
}

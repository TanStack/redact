import { Suspense } from 'react'

export function SuspenseDemo() {
  return (
    // Error: without `features.suspense`, the fallback never shows.
    <Suspense fallback={<p>Loading…</p>}>
      <p>Children render inline, and the fallback is ignored.</p>
    </Suspense>
  )
}

import { memo, useState } from 'react'

let renders = 0

// No type error: disabling memo only costs performance. Editors mark memo()
// as deprecated while the feature is off.
const Expensive = memo(function Expensive({ label }: { label: string }) {
  renders++
  return <p>{label} rendered {renders} times.</p>
})

export function MemoDemo() {
  const [count, setCount] = useState(0)
  return (
    <>
      <button onClick={() => setCount(count + 1)}>Re-render parent ({count})</button>
      <Expensive label="Memoized child" />
    </>
  )
}

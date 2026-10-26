import { ViewTransition, addTransitionType, startTransition, useState } from 'react'

export function ViewTransitionsDemo() {
  const [on, setOn] = useState(false)
  return (
    <>
      <button
        onClick={() =>
          startTransition(() => {
            // No type error: without `features.viewTransitions`, nothing animates.
            // Editors mark addTransitionType() as deprecated while the feature is off.
            addTransitionType('toggle')
            setOn(!on)
          })
        }
      >
        Toggle
      </button>
      <ViewTransition>
        <p>{on ? 'On' : 'Off'}</p>
      </ViewTransition>
    </>
  )
}

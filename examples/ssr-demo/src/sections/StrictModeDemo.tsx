import * as React from 'react'

let mountCount = 0

function MountCounter() {
  React.useEffect(() => {
    mountCount++
    return () => {
      /* ignore for the demo */
    }
  }, [])
  const [tick, setTick] = React.useState(0)
  return (
    <div class="row">
      <span class="pill">mounts observed: {mountCount}</span>
      <button class="ghost" onClick={() => setTick(tick + 1)}>
        refresh
      </button>
    </div>
  )
}

export function StrictModeDemo() {
  const [showStrict, setShowStrict] = React.useState(false)
  return (
    <div class="stack">
      <p class="muted">
        <strong>Known shortcoming.</strong> React's <code>StrictMode</code>{' '}
        double-invokes effects in dev to surface unsafe side effects. Our
        <code>StrictMode</code> is a passthrough — no double-invoke. Toggle the
        wrapper; the mount counter stays at 1.
      </p>
      <div class="row">
        <label class="row" style={{ gap: '0.4rem' }}>
          <input
            type="checkbox"
            checked={showStrict}
            onChange={(e) =>
              setShowStrict((e.target as HTMLInputElement).checked)
            }
          />
          <span class="muted">wrap in &lt;StrictMode&gt;</span>
        </label>
      </div>
      {showStrict ? (
        <React.StrictMode>
          <MountCounter />
        </React.StrictMode>
      ) : (
        <MountCounter />
      )}
    </div>
  )
}

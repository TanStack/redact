import * as React from 'react'

const CELLS = 24 * 24
const cellIds = Array.from({ length: CELLS }, (_, i) => i)

function colorFor(value: number, i: number): string {
  // Simulate expensive per-cell work
  let acc = value
  for (let k = 0; k < 2000; k++) {
    acc = (acc * 9301 + 49297 + i) % 233280
  }
  const h = (acc / 233280) * 360
  return `hsl(${h}, 70%, 45%)`
}

export function HeavyRenderDemo() {
  const [value, setValue] = React.useState(32)
  const [useTransition, setUseTransition] = React.useState(false)

  // Render 576 cells, each with simulated expensive color computation.
  // On a slow machine, sliding should feel janky without a scheduler.
  const cells = cellIds.map((i) => (
    <div key={i} style={{ background: colorFor(value, i) }} />
  ))

  const onChange = (v: number) => {
    if (useTransition) {
      // Our useTransition is a stub → synchronous, so this changes nothing.
      // Left in so you can toggle and feel the difference that *would* exist
      // if we had a real scheduler.
      React.startTransition(() => setValue(v))
    } else {
      setValue(v)
    }
  }

  return (
    <div class="stack">
      <p class="muted">
        <strong>Known shortcoming.</strong> 576 cells, each with ~2k iterations
        of work per render. Drag the slider quickly — without a scheduler we
        block the main thread. Toggling <code>startTransition</code> does{' '}
        <em>nothing</em> here because our implementation is a no-op that runs
        synchronously.
      </p>
      <div class="row">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
          style={{ flex: 1 }}
        />
        <span class="pill">{value}</span>
      </div>
      <label class="row" style={{ gap: '0.4rem' }}>
        <input
          type="checkbox"
          checked={useTransition}
          onChange={(e) => setUseTransition((e.target as HTMLInputElement).checked)}
        />
        <span class="muted">use startTransition (stub — no effect)</span>
      </label>
      <div class="heavy-canvas">{cells}</div>
    </div>
  )
}

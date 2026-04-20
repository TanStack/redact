import * as React from 'react'

// A tiny external store that can tick at configurable rates.
class TickStore {
  private listeners = new Set<() => void>()
  private _value = 0
  private timer: any = null

  getSnapshot = () => this._value

  subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  start(intervalMs: number) {
    this.stop()
    this.timer = setInterval(() => {
      this._value++
      this.listeners.forEach((l) => l())
    }, intervalMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

const store = new TickStore()

function Viewer({ label }: { label: string }) {
  const v = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => 0,
  )
  return (
    <span class="pill">
      {label}: {v}
    </span>
  )
}

export function ExternalStoreDemo() {
  const [running, setRunning] = React.useState(false)

  const toggle = () => {
    if (running) {
      store.stop()
      setRunning(false)
    } else {
      store.start(8)
      setRunning(true)
    }
  }

  return (
    <div class="stack">
      <p class="muted">
        <strong>Known shortcoming.</strong> Three consumers read the same store
        via <code>useSyncExternalStore</code>. On React, they stay perfectly in
        sync under rapid ticks because React uses a snapshot-batching protocol.
        Our simpler implementation can tear briefly on fast updates — look for
        one consumer lagging by a tick.
      </p>
      <div class="row">
        <button onClick={toggle}>{running ? 'stop' : 'start fast ticks (8ms)'}</button>
        <Viewer label="A" />
        <Viewer label="B" />
        <Viewer label="C" />
      </div>
    </div>
  )
}

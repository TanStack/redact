import * as React from 'react'

export function CounterDemo() {
  const [n, setN] = React.useState(0)
  const [logs, setLogs] = React.useState<string[]>([])

  React.useEffect(() => {
    setLogs((l) => [`mount at ${new Date().toLocaleTimeString()}`, ...l].slice(0, 5))
    return () => {
      /* unmount */
    }
  }, [])

  React.useEffect(() => {
    if (n === 0) return
    setLogs((l) => [`n → ${n}`, ...l].slice(0, 5))
  }, [n])

  return (
    <div class="stack">
      <p class="muted">
        <code>useState</code> + <code>useEffect</code>, rendered on the server,
        hydrated on the client.
      </p>
      <div class="row">
        <button onClick={() => setN(n + 1)}>+1</button>
        <button class="ghost" onClick={() => setN(0)}>
          reset
        </button>
        <span class="pill">count = {n}</span>
      </div>
      <div class="muted">
        effect log:
        <ul style="margin:0.3rem 0 0; padding-left: 1.1rem;">
          {logs.length === 0 ? <li>(none)</li> : logs.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </div>
    </div>
  )
}

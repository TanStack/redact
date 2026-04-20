import * as React from 'react'

const slow = <T,>(value: T, ms: number): Promise<T> => {
  return new Promise((r) => setTimeout(() => r(value), ms))
}

// Request-scoped cache so server + client both see same promise identity per request.
declare global {
  interface Window {
    __STREAMING_CACHE__?: Record<string, Promise<any>>
  }
}
const cache: Record<string, Promise<any>> =
  (typeof window !== 'undefined' && (window.__STREAMING_CACHE__ ??= {})) || {}

const getGreeting = () => (cache.greet ??= slow('Hello from a 300 ms deferred read.', 300))
const getFact = () =>
  (cache.fact ??= slow(
    "This text was held back at the server for 900 ms, then streamed in without a full page reload.",
    900,
  ))

function Greeting() {
  const v = React.use(getGreeting())
  return <p class="ok">{v}</p>
}

function Fact() {
  const v = React.use(getFact())
  return <p class="ok">{v}</p>
}

export function StreamingDemo() {
  return (
    <div class="stack">
      <p class="muted">
        Two sibling <code>Suspense</code> boundaries resolve at different times on
        the server. Their HTML arrives as later chunks and is spliced into place
        by our tiny <code>$RC</code> runtime.
      </p>
      <div class="stack">
        <React.Suspense fallback={<p class="muted">Loading greeting…</p>}>
          <Greeting />
        </React.Suspense>
        <React.Suspense fallback={<p class="muted">Loading fact…</p>}>
          <Fact />
        </React.Suspense>
      </div>
    </div>
  )
}

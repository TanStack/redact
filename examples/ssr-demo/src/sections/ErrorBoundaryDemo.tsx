import * as React from 'react'

class Boundary extends React.Component<
  { children: React.ReactNode; reset: number },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(err: Error) {
    return { error: err }
  }
  componentDidCatch(err: Error) {
    console.error('[boundary]', err.message)
  }
  componentDidUpdate(prev: { reset: number }) {
    if (prev.reset !== this.props.reset) {
      this.setState({ error: null })
    }
  }
  render() {
    if (this.state.error) {
      return (
        <p class="danger">
          caught: <code>{this.state.error.message}</code>
        </p>
      )
    }
    return this.props.children as React.ReactElement
  }
}

function MaybeThrow({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Deliberate failure inside <MaybeThrow>')
  return <p class="ok">all good</p>
}

export function ErrorBoundaryDemo() {
  const [broken, setBroken] = React.useState(false)
  const [reset, setReset] = React.useState(0)

  return (
    <div class="stack">
      <p class="muted">
        <code>class Component</code> with <code>getDerivedStateFromError</code>{' '}
        and <code>componentDidCatch</code>. Throw on click, reset via prop.
      </p>
      <div class="row">
        <button onClick={() => setBroken(true)}>throw</button>
        <button
          class="ghost"
          onClick={() => {
            setBroken(false)
            setReset((r) => r + 1)
          }}
        >
          reset
        </button>
      </div>
      <Boundary reset={reset}>
        <MaybeThrow shouldThrow={broken} />
      </Boundary>
    </div>
  )
}

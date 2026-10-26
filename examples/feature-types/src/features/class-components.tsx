import { Component, type ReactNode } from 'react'

// OK: constructor, render, setState, and componentWillUnmount still work.
class Counter extends Component<{}, { count: number }> {
  state = { count: 0 }
  componentWillUnmount() {
    console.log('Counter unmounted')
  }
  render() {
    return <button onClick={() => this.setState({ count: this.state.count + 1 })}>Clicked {this.state.count} times</button>
  }
}

class MountStatus extends Component<{}, { mounted: boolean }> {
  state = { mounted: false }
  // Error: other lifecycles are ignored without `features.classComponents`.
  componentDidMount() {
    this.setState({ mounted: true })
  }
  render() {
    return <p>componentDidMount {this.state.mounted ? 'ran' : 'never ran'}.</p>
  }
}

// Error: error boundaries need `features.classComponents`.
class Boundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p>Something broke.</p> : this.props.children
  }
}

export function ClassComponentsDemo() {
  return (
    <Boundary>
      <Counter />
      {/* Error: a class with an ignored lifecycle can't be rendered either. */}
      <MountStatus />
    </Boundary>
  )
}

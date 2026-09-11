import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

for (const wrapper of ['memo', 'lazy'] as const) {
  for (const phase of ['render', 'snapshot'] as const) {
    it(`${wrapper} class boundaries catch independently scheduled child ${phase} errors`, async () => {
      const container = document.createElement('div')
      document.body.append(container)
      const caught: Array<[unknown, string | null]> = []
      const uncaught: unknown[] = []
      const root = createRoot(container, { onCaughtError() {}, onUncaughtError(error: unknown) { uncaught.push(error) } })
      cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
      const failure = new Error(phase + ' failed')
      let fail!: () => void
      class Boundary extends React.Component<{ children?: React.ReactNode }, { failed: boolean }> {
        state = { failed: false }
        constructor(props: { children?: React.ReactNode }) {
          super(props)
          // User-owned instance properties must not replace renderer type metadata.
          Object.defineProperty(this, 'constructor', { value: function Unrelated() {} })
        }
        static getDerivedStateFromError() { return { failed: true } }
        componentDidCatch(error: unknown) { caught.push([error, container.textContent]) }
        render() { return this.state.failed ? <strong>caught</strong> : this.props.children }
      }
      class PassThrough extends React.Component<{ children?: React.ReactNode }> {
        render() { return this.props.children }
      }
      function RenderChild() {
        const [broken, set] = React.useState(false)
        fail = () => set(true)
        if (broken) throw failure
        return <span>healthy</span>
      }
      class SnapshotChild extends React.Component<{}, { value: number }> {
        state = { value: 0 }
        render() {
          fail = () => this.setState({ value: 1 })
          return <span>healthy:{this.state.value}</span>
        }
        getSnapshotBeforeUpdate() { throw failure }
        componentDidUpdate() {}
      }
      const Wrapped: any = wrapper === 'memo' ? React.memo(Boundary as any) : React.lazy(() => Promise.resolve({ default: Boundary }))
      flushSync(() => root.render(<React.Suspense fallback={<i>loading</i>}>
        <Wrapped><PassThrough>{phase === 'render' ? <RenderChild /> : <SnapshotChild />}</PassThrough></Wrapped>
      </React.Suspense>))
      await vi.waitFor(() => expect(container.querySelector('span')).not.toBeNull())
      flushSync(() => fail())
      await vi.waitFor(() => expect(container.textContent).toBe('caught'))
      expect(uncaught).toEqual([])
      expect(caught).toEqual([[failure, 'caught']])
    })
  }
}

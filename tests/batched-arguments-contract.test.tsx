import { expect, it } from 'vitest'
import { unstable_batchedUpdates } from 'react-dom'
const batch: any = unstable_batchedUpdates
it('forwards the supplied value and callback result', () => {
 const value = Symbol('argument')
 expect(batch((arg: unknown) => arg, value)).toBe(value)
})
it('preserves the native single-argument callback convention', () => {
 expect(batch(function() { return Array.from(arguments) })).toEqual([undefined])
 expect(batch(function() { return Array.from(arguments) }, 'one', 'ignored')).toEqual(['one'])
})
it('forwards nested callback values', () => {
 expect(batch(() => batch((arg: number) => arg + 1, 2), 'outer')).toBe(3)
})
it('preserves the thrown error identity', () => {
 const failure = new Error('batch failure')
 expect(() => batch(() => { throw failure }, 'value')).toThrow(failure)
})
it('does not forward the batching function receiver to the callback', () => {
 expect(batch.call({ caller: true }, function(this: unknown) { return this }, 'value')).toBeUndefined()
})
it('keeps nested state updates batched and restores the previous batching scope', async () => {
 const { Component, createElement: h, act } = await import('react')
 const { createRoot } = await import('react-dom/client')
 const { flushSync } = await import('react-dom')
 const container = document.createElement('div'), root = createRoot(container); let instance!: Counter
 class Counter extends Component<{}, { n: number }> { state = { n: 0 }; render() { instance = this; return h('p', null, this.state.n) } }
 flushSync(() => root.render(h(Counter)))
 try { await act(async () => { batch(() => { instance.setState({ n: 1 }); batch((n: number) => instance.setState({ n }), 2); expect(container.textContent).toBe('0') }); await Promise.resolve() }); expect(container.textContent).toBe('2') }
 finally { flushSync(() => root.unmount()) }
})
it('restores batching after a callback throws', async () => {
 const { Component, createElement: h, act } = await import('react')
 const { createRoot } = await import('react-dom/client')
 const { flushSync } = await import('react-dom')
 const container = document.createElement('div'), root = createRoot(container); let instance!: Counter
 class Counter extends Component<{}, { n: number }> { state = { n: 0 }; render() { instance = this; return h('p', null, this.state.n) } }
 flushSync(() => root.render(h(Counter)))
 try { await act(async () => { try { batch(() => { instance.setState({ n: 1 }); throw new Error('expected') }) } catch {} instance.setState({ n: 2 }); await Promise.resolve() }); expect(container.textContent).toBe('2') }
 finally { flushSync(() => root.unmount()) }
})

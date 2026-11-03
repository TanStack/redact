import { afterEach, expect, it } from 'vitest'
import { Component, Activity, createElement as h, act } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
const roots: ReturnType<typeof createRoot>[] = []
afterEach(() => { for (const root of roots.splice(0)) flushSync(() => root.unmount()); document.body.innerHTML = '' })
function setup() { const element = document.createElement('main'); document.body.append(element); const root = createRoot(element); roots.push(root); return { root, element } }
it('runs callbacks after their own update lifecycles, including updates from lifecycles', () => {
 const { root } = setup(), calls: string[] = []
 class Counter extends Component<{}, { n: number }> {
  state = { n: 0 }
  componentDidMount() { this.setState({ n: 1 }, () => calls.push('mount callback')) }
  componentDidUpdate(_p: {}, previous: { n: number }) { calls.push(previous.n + '->' + this.state.n); if (this.state.n === 1) this.setState({ n: 2 }, () => calls.push('update callback')) }
  render() { return h('p', null, this.state.n) }
 }
 flushSync(() => root.render(h(Counter)))
 expect(calls).toEqual(['0->1', 'mount callback', '1->2', 'update callback'])
})
it('defers hidden Activity callbacks until the class becomes visible', async () => {
 const { root } = setup(), calls: string[] = []; let instance!: Counter
 class Counter extends Component<{}, { n: number }> { state = { n: 0 }; render() { instance = this; return h('p', null, this.state.n) } }
 const render = (mode: 'visible' | 'hidden') => flushSync(() => root.render(h(Activity, { mode }, h(Counter))))
 render('visible'); render('hidden')
 await act(async () => { instance.setState({ n: 1 }, () => calls.push('callback')); await Promise.resolve() })
 expect(calls).toEqual([]); render('visible'); expect(calls).toEqual(['callback'])
})
it('runs a callback even when shouldComponentUpdate skips rendering', () => {
 const { root } = setup(), calls: string[] = []; let instance!: Counter
 class Counter extends Component<{}, { n: number }> { state = { n: 0 }; shouldComponentUpdate() { return false } render() { instance = this; return h('p', null, this.state.n) } }
 flushSync(() => root.render(h(Counter)))
 flushSync(() => instance.setState({ n: 1 }, function(this: Counter) { calls.push(this.state.n + '') }))
 expect(calls).toEqual(['1'])
})
it('does not commit a callback while its update is suspended', async () => {
 const { root } = setup(), calls: string[] = []; let instance!: Counter, resolve!: () => void, pending = true
 const gate = new Promise<void>(done => { resolve = done })
 function Child({ n }: { n: number }) { if (n === 1 && pending) throw gate; return h('p', null, n) }
 class Counter extends Component<{}, { n: number }> { state = { n: 0 }; render() { instance = this; return h(Child, { n: this.state.n }) } }
 const { Suspense } = await import('react')
 flushSync(() => root.render(h(Suspense, { fallback: h('p', null, 'loading') }, h(Counter))))
 flushSync(() => instance.setState({ n: 1 }, () => calls.push('callback')))
 expect(calls).toEqual([])
 await act(async () => { pending = false; resolve(); await gate })
 expect(calls).toEqual(['callback'])
})
it('runs transition callbacks after componentDidUpdate', async () => {
 const { root } = setup(), calls: string[] = []; let instance!: Counter
 class Counter extends Component<{}, { n: number }> { state = { n: 0 }; componentDidUpdate() { calls.push('updated') } render() { instance = this; return h('p', null, this.state.n) } }
 const { startTransition } = await import('react')
 flushSync(() => root.render(h(Counter)))
 await act(async () => { startTransition(() => instance.setState({ n: 1 }, () => calls.push('callback'))); await Promise.resolve() })
 expect(calls).toEqual(['updated', 'callback'])
})
it('does not run callbacks from an unmounted suspended update', async () => {
 const { root } = setup(), calls: string[] = []; let instance!: Counter, resolve!: () => void, pending = true
 const gate = new Promise<void>(done => { resolve = done })
 function Child({ n }: { n: number }) { if (n && pending) throw gate; return h('p', null, n) }
 class Counter extends Component<{}, { n: number }> { state = { n: 0 }; render() { instance = this; return h(Child, { n: this.state.n }) } }
 const { Suspense } = await import('react')
 flushSync(() => root.render(h(Suspense, { fallback: 'loading' }, h(Counter))))
 flushSync(() => instance.setState({ n: 1 }, () => calls.push('callback')))
 flushSync(() => root.render(null))
 await act(async () => { pending = false; resolve(); await gate })
 expect(calls).toEqual([])
})
it('does not run callbacks from a transition abandoned by unmount', async () => {
 const { root } = setup(), calls: string[] = []; let instance!: Counter
 class Counter extends Component<{}, { n: number }> { state = { n: 0 }; render() { instance = this; return h('p', null, this.state.n) } }
 const { startTransition } = await import('react')
 flushSync(() => root.render(h(Counter)))
 await act(async () => { startTransition(() => instance.setState({ n: 1 }, () => calls.push('callback'))); root.unmount(); await Promise.resolve() })
 roots.splice(roots.indexOf(root), 1)
 expect(calls).toEqual([])
})
it('does not replay an urgent callback when a suspended transition retries', async () => {
 const { root, element } = setup(), calls: string[] = []; let instance!: Counter, resolve!: () => void, pending = true
 const gate = new Promise<void>(done => { resolve = done })
 function Child({ n, label }: { n: number, label: string }) { if (n === 1 && pending) throw gate; return h('p', null, n + ' ' + label) }
 class Counter extends Component<{}, { n: number, label: string }> { state = { n: 0, label: 'initial' }; render() { instance = this; return h(Child, this.state) } }
 const { Suspense, startTransition } = await import('react')
 flushSync(() => root.render(h(Suspense, { fallback: 'loading' }, h(Counter))))
 await act(async () => { startTransition(() => instance.setState({ n: 1 }, () => calls.push('transition'))); await Promise.resolve() })
 expect(calls).toEqual([])
 flushSync(() => instance.setState({ label: 'urgent' }, () => calls.push('urgent')))
 expect(calls).toEqual(['urgent'])
 await act(async () => { pending = false; resolve(); await gate })
 expect(element.textContent).toBe('1 urgent'); expect(calls).toEqual(['urgent', 'transition'])
})
it('keeps every hidden callback in order until reveal', async () => {
 const { root } = setup(), calls: string[] = []; let instance!: Counter
 class Counter extends Component<{}, { n: number }> { state = { n: 0 }; render() { instance = this; return h('p', null, this.state.n) } }
 const render = (mode: 'visible' | 'hidden') => flushSync(() => root.render(h(Activity, { mode }, h(Counter))))
 render('visible'); render('hidden')
 await act(async () => { instance.setState({ n: 1 }, () => calls.push('one')); instance.setState({ n: 2 }, () => calls.push('two')); await Promise.resolve() })
 expect(calls).toEqual([]); render('visible'); expect(calls).toEqual(['one', 'two'])
})
it('runs forceUpdate callbacks after the update lifecycle', () => {
 const { root } = setup(), calls: string[] = []; let instance!: Counter
 class Counter extends Component { componentDidUpdate() { calls.push('updated') } render() { instance = this; return h('p', null, 'ready') } }
 flushSync(() => root.render(h(Counter)))
 flushSync(() => instance.forceUpdate(() => calls.push('callback')))
 expect(calls).toEqual(['updated', 'callback'])
})
it('keeps callbacks from an initially hidden class until its mount lifecycle', async () => {
 const { root } = setup(), calls: string[] = []; let instance!: Counter
 class Counter extends Component<{}, { n: number }> { state = { n: 0 }; componentDidMount() { calls.push('mounted') } render() { instance = this; return h('p', null, this.state.n) } }
 await act(async () => { root.render(h(Activity, { mode: 'hidden' }, h(Counter))); await Promise.resolve() })
 expect(instance).toBeDefined()
 await act(async () => { instance.setState({ n: 1 }, () => calls.push('callback')); await Promise.resolve() })
 expect(calls).toEqual([])
 flushSync(() => root.render(h(Activity, { mode: 'visible' }, h(Counter))))
 expect(calls).toEqual(['mounted', 'callback'])
})
it('drops callbacks when a hidden Activity is removed before reveal', async () => {
 const { root } = setup(), calls: string[] = []; let instance!: Counter
 class Counter extends Component<{}, { n: number }> { state = { n: 0 }; render() { instance = this; return h('p', null, this.state.n) } }
 flushSync(() => root.render(h(Activity, { mode: 'visible' }, h(Counter))))
 flushSync(() => root.render(h(Activity, { mode: 'hidden' }, h(Counter))))
 await act(async () => { instance.setState({ n: 1 }, () => calls.push('callback')); await Promise.resolve() })
 flushSync(() => root.render(null)); expect(calls).toEqual([])
})

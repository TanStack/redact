import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { Activity, Component, Suspense, ViewTransition, addTransitionType, startTransition, useLayoutEffect, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal, flushSync } from 'react-dom'
import type { ReactNode } from 'react'

const native = document.startViewTransition?.bind(document)
const transitions: ViewTransition[] = []
const cleanups: Array<() => void> = []
let calls: ReturnType<typeof vi.fn>

beforeEach(() => {
  calls = vi.fn()
  if (native) vi.spyOn(document, 'startViewTransition').mockImplementation((options: any) => {
    calls(options)
    const transition = native(options)
    // Skipped native transitions reject ready, even when rendering succeeds.
    transition.ready.catch(() => {})
    transitions.push(transition)
    return transition
  })
})

afterEach(async () => {
  // Unmount first so pending captures are cancelled by their owning roots.
  for (const cleanup of cleanups.splice(0)) cleanup()
  for (const transition of transitions.splice(0)) {
    transition.skipTransition()
    await transition.finished.catch(() => {})
  }
  vi.restoreAllMocks()
})

function setup() {
  const style = document.createElement('style')
  style.textContent = '::view-transition-group(*) { animation-duration: 2s; } ::view-transition-old(*), ::view-transition-new(*) { animation-duration: 2s; }'
  document.head.appendChild(style)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove(); style.remove() })
  return { container, root, render: (node: ReactNode) => flushSync(() => root.render(node)) }
}

async function until(check: () => boolean) {
  await vi.waitFor(() => expect(check()).toBe(true), { timeout: 4000, interval: 10 })
}

async function animate(update: () => void) {
  const count = transitions.length
  startTransition(update)
  await until(() => transitions.length > count)
  const transition = transitions[count]!
  await transition.ready
  return transition
}

function pseudos() {
  return document.getAnimations().map(animation => (animation.effect as KeyframeEffect).pseudoElement ?? '')
}

function expectSuppressed(name: string, kind = 'group') {
  const selector = `::view-transition-${kind}(${name})`
  const captured = pseudos().some(pseudo => kind === 'group' ? pseudo.includes(`(${name})`) : pseudo === selector)
  expect(!captured || getComputedStyle(document.documentElement, selector).opacity === '0').toBe(true)
}

describe.runIf(!!native)('native ViewTransition parity', () => {
  it('animates updates with real browser pseudo-elements and restores author styles', async () => {
    const { container, render } = setup()
    const style = document.createElement('style')
    style.textContent = '::view-transition-new(.author-animation) { animation-duration: 1.234s; }'
    document.head.appendChild(style); cleanups.push(() => style.remove())
    let set!: (value: number) => void
    const callback = vi.fn(() => cleanup)
    const cleanup = vi.fn()
    function App() {
      const [value, update] = useState(0); set = update
      return <ViewTransition name="update-card" onUpdate={callback}><div style={{ viewTransitionName: 'author-name', viewTransitionClass: 'author-animation' }}>{value}</div></ViewTransition>
    }
    render(<App />)
    expect(calls).not.toHaveBeenCalled()
    const element = container.firstElementChild as HTMLElement
    const transition = await animate(() => set(1))
    await until(() => callback.mock.calls.length === 1)
    expect(container.firstElementChild).toBe(element)
    expect(container.textContent).toBe('1')
    expect(pseudos()).toContain('::view-transition-old(update-card)')
    expect(pseudos()).toContain('::view-transition-new(update-card)')
    const animation = document.getAnimations().find(animation => (animation.effect as KeyframeEffect).pseudoElement === '::view-transition-new(update-card)')!
    expect(animation.effect?.getTiming().duration).toBe(1234)
    expect(cleanup).not.toHaveBeenCalled()
    transition.skipTransition()
    await transition.finished
    await until(() => cleanup.mock.calls.length === 1)
    expect(element.style.viewTransitionName).toBe('author-name')
    expect(element.style.viewTransitionClass).toBe('author-animation')
  })

  it('animates enter and exit with the corresponding callback only', async () => {
    const { render } = setup()
    let set!: (value: boolean) => void
    const enter = vi.fn(), exit = vi.fn(), update = vi.fn(), share = vi.fn()
    function App() {
      const [show, change] = useState(false); set = change
      return show ? <ViewTransition name="presence" onEnter={enter} onExit={exit} onUpdate={update} onShare={share}><div>present</div></ViewTransition> : null
    }
    render(<App />)
    const first = await animate(() => set(true))
    await until(() => enter.mock.calls.length === 1)
    expect(pseudos()).toContain('::view-transition-new(presence)')
    expect(exit).not.toHaveBeenCalled()
    first.skipTransition(); await first.finished
    await animate(() => set(false))
    await until(() => exit.mock.calls.length === 1)
    expect(pseudos()).toContain('::view-transition-old(presence)')
    expect(update).not.toHaveBeenCalled()
    expect(share).not.toHaveBeenCalled()
  })

  it('pairs deleted and inserted named boundaries and calls the outgoing share callback', async () => {
    const { container, render } = setup()
    let set!: (value: boolean) => void
    const oldShare = vi.fn(), newShare = vi.fn(), presence = vi.fn()
    function Old() { return <ViewTransition name="shared-card" onShare={oldShare} onExit={presence}><div>old</div></ViewTransition> }
    function New() { return <ViewTransition name="shared-card" onShare={newShare} onEnter={presence}><section>new</section></ViewTransition> }
    function App() {
      const [next, change] = useState(false); set = change
      return next ? <New /> : <Old />
    }
    render(<App />)
    await animate(() => set(true))
    await until(() => oldShare.mock.calls.length === 1)
    // Pinned React 19.3 invokes the outgoing callback, despite docs saying both.
    expect(newShare).not.toHaveBeenCalled()
    expect(container.firstElementChild?.tagName).toBe('SECTION')
    expect(pseudos()).toContain('::view-transition-old(shared-card)')
    expect(pseudos()).toContain('::view-transition-new(shared-card)')
    expect(presence).not.toHaveBeenCalled()
  })

  it('applies type-selected classes and provides native animation handles', async () => {
    const { render } = setup()
    const style = document.createElement('style')
    style.textContent = '::view-transition-new(.forward-card) { animation-duration: 1.234s; }'
    document.head.appendChild(style); cleanups.push(() => style.remove())
    let set!: (value: number) => void
    let instance: any, receivedTypes: string[] | undefined
    function App() {
      const [value, change] = useState(0); set = change
      return <ViewTransition name="typed-card" update={{ forward: 'forward-card', default: 'none' }} onUpdate={(value, types) => { instance = value; receivedTypes = types }}><div>{value}</div></ViewTransition>
    }
    render(<App />)
    await animate(() => { addTransitionType('forward'); set(1) })
    await until(() => !!instance)
    expect(receivedTypes).toEqual(['forward'])
    expect(instance.name).toBe('typed-card')
    const nativeAnimation = document.getAnimations().find(animation => (animation.effect as KeyframeEffect).pseudoElement === '::view-transition-new(typed-card)')!
    expect(nativeAnimation.effect?.getTiming().duration).toBe(1234)
    const animation = instance.new.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 100 })
    expect(animation).toBeInstanceOf(Animation)
    expect((animation.effect as KeyframeEffect).pseudoElement).toBe('::view-transition-new(typed-card)')
    expect(instance.new.getAnimations()).toContain(animation)
    expect(instance.old.getAnimations()).not.toContain(animation)
    expect(instance.new.getComputedStyle().animationDuration).toBe('1.234s')
    animation.cancel()
  })

  it('assigns unique snapshot names to multiple host children', async () => {
    const { render } = setup()
    let set!: (value: number) => void
    const updated = vi.fn()
    function App() {
      const [value, change] = useState(0); set = change
      return <ViewTransition name="siblings" onUpdate={updated}><div>{value}</div><div>{value}</div></ViewTransition>
    }
    render(<App />)
    await animate(() => set(1))
    await until(() => updated.mock.calls.length === 1)
    const names = pseudos().filter(name => name.startsWith('::view-transition-new(siblings'))
    expect(new Set(names).size).toBe(2)
  })

  it('attributes nested content updates to the nearest boundary', async () => {
    const { render } = setup()
    let set!: (value: number) => void
    const outer = vi.fn(), inner = vi.fn()
    function App() {
      const [value, change] = useState(0); set = change
      return <ViewTransition name="outer" onUpdate={outer}><div style={{ width: 100, height: 100 }}><ViewTransition name="inner" onUpdate={inner}><span>{value}</span></ViewTransition></div></ViewTransition>
    }
    render(<App />)
    await animate(() => set(1))
    await until(() => inner.mock.calls.length === 1)
    expect(outer).not.toHaveBeenCalled()
    expect(pseudos()).toContain('::view-transition-new(inner)')
  })

  it('animates Activity visibility without replacing its DOM', async () => {
    const { container, render } = setup()
    let set!: (value: boolean) => void
    const enter = vi.fn(), exit = vi.fn()
    function App() {
      const [visible, change] = useState(true); set = change
      return <Activity mode={visible ? 'visible' : 'hidden'}><ViewTransition name="activity-card" onEnter={enter} onExit={exit}><div>retained</div></ViewTransition></Activity>
    }
    render(<App />)
    const node = container.firstElementChild
    const first = await animate(() => set(false))
    await until(() => exit.mock.calls.length === 1)
    expect(container.firstElementChild).toBe(node)
    expect(pseudos()).toContain('::view-transition-old(activity-card)')
    first.skipTransition(); await first.finished
    await animate(() => set(true))
    await until(() => enter.mock.calls.length === 1)
    expect(container.firstElementChild).toBe(node)
    expect(pseudos()).toContain('::view-transition-new(activity-card)')
  })

  it('does not activate callbacks for ordinary synchronous updates', async () => {
    const { container, render } = setup()
    let set!: (value: number) => void
    const update = vi.fn()
    function App() { const [value, change] = useState(0); set = change; return <ViewTransition onUpdate={update}><div>{value}</div></ViewTransition> }
    render(<App />)
    flushSync(() => set(1))
    expect(container.textContent).toBe('1')
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(calls).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('lets flushSync commit immediately while an animation is running', async () => {
    const { container, render } = setup()
    let set!: (value: number) => void
    const update = vi.fn()
    function App() { const [value, change] = useState(0); set = change; return <ViewTransition name="interrupted" onUpdate={update}><div>{value}</div></ViewTransition> }
    render(<App />)
    await animate(() => set(1))
    await until(() => update.mock.calls.length === 1)
    flushSync(() => set(2))
    expect(container.textContent).toBe('2')
    expect(calls).toHaveBeenCalledTimes(1)
  })

  it('does not animate an unchanged sibling boundary', async () => {
    const { render } = setup()
    let set!: (value: number) => void
    const changed = vi.fn(), unchanged = vi.fn()
    function App() {
      const [value, change] = useState(0); set = change
      return <><ViewTransition name="changed" onUpdate={changed}><div style={{ width: 100, height: 30 }}>{value}</div></ViewTransition><ViewTransition name="unchanged" onUpdate={unchanged}><div>stable</div></ViewTransition></>
    }
    render(<App />)
    await animate(() => set(1))
    await until(() => changed.mock.calls.length === 1)
    expect(unchanged).not.toHaveBeenCalled()
    // React hides an unused old snapshot with an opacity-zero group animation.
    expectSuppressed('unchanged')
  })

  it('respects update none while another boundary animates', async () => {
    const { render } = setup()
    let set!: (value: number) => void
    const animated = vi.fn(), disabled = vi.fn()
    function App() {
      const [value, change] = useState(0); set = change
      return <><ViewTransition name="enabled" onUpdate={animated}><div>{value}</div></ViewTransition><ViewTransition name="disabled" update="none" onUpdate={disabled}><div>{value}</div></ViewTransition></>
    }
    render(<App />)
    await animate(() => set(1))
    await until(() => animated.mock.calls.length === 1)
    expect(disabled).not.toHaveBeenCalled()
    expectSuppressed('disabled')
  })

  it('does not activate enter under a newly inserted host wrapper', async () => {
    const { container, render } = setup()
    let set!: (value: boolean) => void
    const entered = vi.fn()
    function App() {
      const [show, change] = useState(false); set = change
      return show ? <section><ViewTransition name="wrapped" onEnter={entered}><div>wrapped</div></ViewTransition></section> : null
    }
    render(<App />)
    startTransition(() => set(true))
    await until(() => container.textContent === 'wrapped')
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(entered).not.toHaveBeenCalled()
    expectSuppressed('wrapped')
  })

  it('coalesces later transitions until the current animation finishes', async () => {
    const { container, render } = setup()
    let set!: (value: number) => void
    const updated = vi.fn()
    function App() { const [value, change] = useState(0); set = change; return <ViewTransition name="queued" onUpdate={updated}><div>{value}</div></ViewTransition> }
    render(<App />)
    const first = await animate(() => set(1))
    await until(() => updated.mock.calls.length === 1)
    const immediate: string[] = []
    startTransition(() => { immediate.push('second'); set(2) })
    startTransition(() => { immediate.push('third'); set(3) })
    expect(immediate).toEqual(['second', 'third'])
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(container.textContent).toBe('1')
    expect(calls).toHaveBeenCalledTimes(1)
    first.skipTransition(); await first.finished
    await until(() => transitions.length === 2)
    await transitions[1]!.ready
    await until(() => updated.mock.calls.length === 2)
    expect(container.textContent).toBe('3')
    expect(calls).toHaveBeenCalledTimes(2)
  })

  it('animates named boundaries moved by keyed host wrappers like the pinned reference', async () => {
    const { container, render } = setup()
    let set!: (value: boolean) => void
    const updated = vi.fn()
    function App() {
      const [reverse, change] = useState(false); set = change
      return (reverse ? ['b', 'a'] : ['a', 'b']).map(name => <div key={name}><ViewTransition name={`wrapped-${name}`} onUpdate={updated}><div>{name}</div></ViewTransition></div>)
    }
    render(<App />)
    await animate(() => set(true))
    await until(() => updated.mock.calls.length === 2)
    expect(container.textContent).toBe('ba')
    expect(pseudos()).toContain('::view-transition-new(wrapped-a)')
    expect(pseudos()).toContain('::view-transition-new(wrapped-b)')
  })

  it('lets user CSS respond to the browser reduced-motion preference', async () => {
    const { render } = setup()
    const style = document.createElement('style')
    style.textContent = '::view-transition-new(.motion-aware) { animation-duration: 1.5s; } @media (prefers-reduced-motion: reduce) { ::view-transition-new(.motion-aware) { animation-duration: 0.25s; } }'
    document.head.appendChild(style); cleanups.push(() => style.remove())
    let set!: (value: number) => void
    const updated = vi.fn()
    function App() { const [value, change] = useState(0); set = change; return <ViewTransition name="motion-aware" update="motion-aware" onUpdate={updated}><div>{value}</div></ViewTransition> }
    render(<App />)
    await animate(() => set(1))
    await until(() => updated.mock.calls.length === 1)
    const animation = document.getAnimations().find(animation => (animation.effect as KeyframeEffect).pseudoElement === '::view-transition-new(motion-aware)')!
    expect(animation.effect?.getTiming().duration).toBe(matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : 1500)
  })

  it.each(['outgoing', 'incoming'] as const)('respects share none on the %s side', async (side) => {
    const { render } = setup()
    let set!: (value: boolean) => void
    const enter = vi.fn(), exit = vi.fn(), share = vi.fn()
    function Old() { return <ViewTransition name="disabled-share" share={side === 'outgoing' ? 'none' : 'auto'} onExit={exit} onShare={share}><div>old</div></ViewTransition> }
    function New() { return <ViewTransition name="disabled-share" share={side === 'incoming' ? 'none' : 'auto'} onEnter={enter} onShare={share}><div>new</div></ViewTransition> }
    function App() { const [next, change] = useState(false); set = change; return next ? <New /> : <Old /> }
    render(<App />)
    const transition = await animate(() => set(true))
    if (side === 'outgoing') {
      await until(() => enter.mock.calls.length === 1)
      expect(share).not.toHaveBeenCalled()
      expect(pseudos()).toContain('::view-transition-new(disabled-share)')
      expect(pseudos()).not.toContain('::view-transition-old(disabled-share)')
    } else {
      await until(() => share.mock.calls.length === 1)
      expect(enter).not.toHaveBeenCalled()
      expect(pseudos()).toContain('::view-transition-old(disabled-share)')
      expect(pseudos()).not.toContain('::view-transition-new(disabled-share)')
    }
    expect(exit).not.toHaveBeenCalled()
    transition.skipTransition(); await transition.finished
  })

  it('uses the outgoing share class for an old-only shared capture', async () => {
    const { render } = setup()
    const style = document.createElement('style')
    style.textContent = '::view-transition-old(.exit-style) { animation-duration: 0.567s; } ::view-transition-old(.share-style) { animation-duration: 1.234s; }'
    document.head.appendChild(style); cleanups.push(() => style.remove())
    let set!: (value: boolean) => void
    const shared = vi.fn()
    function Old() { return <ViewTransition name="old-only" exit="exit-style" share="share-style" onShare={shared}><div>old</div></ViewTransition> }
    function New() { return <ViewTransition name="old-only" share="none"><div>new</div></ViewTransition> }
    function App() { const [next, change] = useState(false); set = change; return next ? <New /> : <Old /> }
    render(<App />)
    await animate(() => set(true))
    await until(() => shared.mock.calls.length === 1)
    const animation = document.getAnimations().find(animation => (animation.effect as KeyframeEffect).pseudoElement === '::view-transition-old(old-only)')!
    expect(animation.effect?.getTiming().duration).toBe(1234)
  })

  it('gives a directly nested shared host to the inner boundary', async () => {
    const { render } = setup()
    let set!: (value: number) => void
    const outer = vi.fn(), inner = vi.fn()
    function App() {
      const [value, change] = useState(0); set = change
      return <ViewTransition name="same-host-outer" onUpdate={outer}><ViewTransition name="same-host-inner" onUpdate={inner}><div>{value}</div></ViewTransition></ViewTransition>
    }
    render(<App />)
    await animate(() => set(1))
    await until(() => inner.mock.calls.length === 1)
    expect(outer).not.toHaveBeenCalled()
    expect(pseudos()).toContain('::view-transition-new(same-host-inner)')
    expect(pseudos().some(name => name.includes('(same-host-outer)'))).toBe(false)
  })

  it('normalizes native names that contain CSS identifier punctuation', async () => {
    const { render } = setup()
    let set!: (value: number) => void
    const updated = vi.fn()
    function App() { const [value, change] = useState(0); set = change; return <ViewTransition name="card:detail" onUpdate={updated}><div>{value}</div></ViewTransition> }
    render(<App />)
    await animate(() => set(1))
    await until(() => updated.mock.calls.length === 1)
    expect(updated.mock.calls[0]?.[0]?.name).toBe('card:detail')
    expect(pseudos()).toContain('::view-transition-new(r-Y2FyZDpkZXRhaWw)')
    expect(pseudos()).toContain('::view-transition-old(r-Y2FyZDpkZXRhaWw)')
  })

  it('captures every old host when a multi-host boundary shrinks', async () => {
    const { render } = setup()
    const style = document.createElement('style')
    style.textContent = '::view-transition-old(.previous-update) { animation-duration: 0.567s; } ::view-transition-old(.next-update) { animation-duration: 1.234s; }'
    document.head.appendChild(style); cleanups.push(() => style.remove())
    let set!: (value: boolean) => void
    const updated = vi.fn()
    function App() {
      const [shrink, change] = useState(false); set = change
      return <ViewTransition name="shrinking" update={shrink ? 'next-update' : 'previous-update'} onUpdate={updated}><div>first</div>{shrink ? null : <div>second</div>}</ViewTransition>
    }
    render(<App />)
    await animate(() => set(true))
    await until(() => updated.mock.calls.length === 1)
    const oldNames = new Set(pseudos().filter(name => name.startsWith('::view-transition-old(shrinking')))
    const newNames = new Set(pseudos().filter(name => name.startsWith('::view-transition-new(shrinking')))
    expect(oldNames.size).toBe(2)
    expect(newNames.size).toBe(1)
    const oldAnimations = document.getAnimations().filter(animation => (animation.effect as KeyframeEffect).pseudoElement?.startsWith('::view-transition-old(shrinking'))
    expect(oldAnimations.every(animation => animation.effect?.getTiming().duration === 1234)).toBe(true)
  })

  it('renders and runs class snapshots before starting native capture, then commits inside it', async () => {
    const { container, render } = setup()
    const events: string[] = []
    let set!: (value: number) => void
    class Child extends Component<{ value: number }> {
      getSnapshotBeforeUpdate() { events.push(`snapshot:${container.textContent}`); return 'captured' }
      componentDidUpdate(_props: unknown, _state: unknown, snapshot: unknown) { events.push(`layout:${container.textContent}:${snapshot}`) }
      render() { events.push(`render:${this.props.value}`); return <div>{this.props.value}</div> }
    }
    const updated = vi.fn(() => { events.push(`animation:${container.textContent}`) })
    function App() { const [value, change] = useState(0); set = change; return <ViewTransition name="snapshot-order" onUpdate={updated}><Child value={value} /></ViewTransition> }
    render(<App />); events.length = 0
    calls.mockImplementation((options: any) => {
      events.push(`native-start:${container.textContent}`)
      const update = options.update
      options.update = () => { events.push(`native-update:${container.textContent}`); return update() }
    })
    await animate(() => set(1))
    await until(() => updated.mock.calls.length === 1)
    expect(events).toEqual(['render:1', 'snapshot:0', 'native-start:0', 'native-update:0', 'layout:1:captured', 'animation:1'])
  })

  it('runs layout effects and refs before animation callbacks and passive effects after finish', async () => {
    const { container, render } = setup()
    const events: string[] = []
    let set!: (value: number) => void
    const updated = vi.fn(() => { events.push('animation') })
    function App() {
      const [value, change] = useState(0); set = change
      useLayoutEffect(() => { events.push(`layout:${value}:${container.textContent}`); return () => { events.push(`layout-cleanup:${value}`) } }, [value])
      useEffect(() => { events.push(`passive:${value}`); return () => { events.push(`passive-cleanup:${value}`) } }, [value])
      return <ViewTransition name="effect-order" onUpdate={updated}><div ref={(element: HTMLDivElement | null) => { if (element) events.push(`ref:${value}:${container.textContent}`); return () => { events.push(`ref-cleanup:${value}`) } }}>{value}</div></ViewTransition>
    }
    render(<App />)
    await until(() => events.includes('passive:0')); events.length = 0
    const transition = await animate(() => set(1))
    await until(() => updated.mock.calls.length === 1)
    expect(events).toEqual(['ref-cleanup:0', 'layout-cleanup:0', 'ref:1:1', 'layout:1:1', 'animation'])
    transition.skipTransition(); await transition.finished
    await until(() => events.includes('passive:1'))
    expect(events).toEqual(['ref-cleanup:0', 'layout-cleanup:0', 'ref:1:1', 'layout:1:1', 'animation', 'passive-cleanup:0', 'passive:1'])
  })

  it('animates a Suspense reveal without reusing an earlier transition type', async () => {
    const { container, render } = setup()
    let resolve!: () => void
    let ready = false
    const promise = new Promise<void>(done => { resolve = () => { ready = true; done() } })
    let set!: (value: boolean) => void
    const revealed = vi.fn()
    function Content() { if (!ready) throw promise; return <ViewTransition name="revealed" onEnter={revealed}><div>content</div></ViewTransition> }
    function App() { const [show, change] = useState(false); set = change; return show ? <Suspense fallback={<div>loading</div>}><Content /></Suspense> : <div>initial</div> }
    render(<App />)
    startTransition(() => { addTransitionType('earlier'); set(true) })
    await until(() => container.textContent === 'loading')
    for (const transition of transitions) { transition.skipTransition(); await transition.finished }
    resolve()
    await until(() => revealed.mock.calls.length === 1)
    expect(revealed.mock.calls[0]?.[1]).toEqual([])
    expect(pseudos()).toContain('::view-transition-new(revealed)')
  })

  it('animates root.render updates made inside startTransition', async () => {
    const { container, root, render } = setup()
    const updated = vi.fn()
    const view = (value: number) => <ViewTransition name="root-render" onUpdate={updated}><div>{value}</div></ViewTransition>
    render(view(0))
    await animate(() => root.render(view(1)))
    await until(() => updated.mock.calls.length === 1)
    expect(container.textContent).toBe('1')
    expect(pseudos()).toContain('::view-transition-new(root-render)')
  })

  it('does not overwrite an urgent update when cancellation follows render but precedes mutation', async () => {
    const { container, render } = setup()
    const rendered: number[] = [], commits: number[] = []
    let set!: (value: number) => void
    let urgentDOM = ''
    const updated = vi.fn()
    function App() {
      const [value, change] = useState(0); set = change; rendered.push(value)
      useLayoutEffect(() => { commits.push(value) }, [value])
      return <ViewTransition name="cancel-prepared" onUpdate={updated}><div>{value}</div></ViewTransition>
    }
    render(<App />)
    calls.mockImplementation(() => {
      expect(rendered).toContain(1)
      expect(container.textContent).toBe('0')
      queueMicrotask(() => { flushSync(() => set(2)); urgentDOM = container.textContent! })
    })
    startTransition(() => set(1))
    await until(() => transitions.length === 1)
    await transitions[0]!.finished
    await until(() => urgentDOM === '2')
    expect(container.textContent).toBe('2')
    expect(updated).not.toHaveBeenCalled()
    expect(commits).toEqual([0, 1, 2])
  })

  it('preserves updates scheduled while the native old snapshot is pending', async () => {
    const { container, render } = setup()
    const commits: number[] = []
    let set!: (value: number | ((value: number) => number)) => void
    const updated = vi.fn()
    function App() {
      const [value, change] = useState(0); set = change
      useLayoutEffect(() => { commits.push(value) }, [value])
      return <ViewTransition name="snapshot-gap" onUpdate={updated}><div>{value}</div></ViewTransition>
    }
    render(<App />)
    calls.mockImplementation(() => {
      if (calls.mock.calls.length === 1) queueMicrotask(() => startTransition(() => { addTransitionType('next'); set(value => value + 1) }))
    })
    const first = await animate(() => { addTransitionType('first'); set(1) })
    await until(() => updated.mock.calls.length === 1)
    expect(commits).toEqual([0, 1])
    expect(container.textContent).toBe('1')
    expect(updated.mock.calls.map(call => call[1])).toEqual([['first']])
    first.skipTransition(); await first.finished
    await until(() => transitions.length === 2)
    await transitions[1]!.ready
    await until(() => updated.mock.calls.length === 2)
    expect(commits).toEqual([0, 1, 2])
    expect(container.textContent).toBe('2')
    expect(updated.mock.calls.map(call => call[1])).toEqual([['first'], ['next']])
  })

  it('preserves a newer root.render queued during native snapshot capture', async () => {
    const { container, root, render } = setup()
    const updated = vi.fn()
    const view = (value: number) => <ViewTransition name="root-gap" onUpdate={updated}><div>{value}</div></ViewTransition>
    render(view(0))
    calls.mockImplementation(() => {
      if (calls.mock.calls.length === 1) queueMicrotask(() => startTransition(() => root.render(view(2))))
    })
    const first = await animate(() => root.render(view(1)))
    await until(() => updated.mock.calls.length === 1)
    expect(container.textContent).toBe('1')
    first.skipTransition(); await first.finished
    await until(() => transitions.length === 2)
    await transitions[1]!.ready
    await until(() => updated.mock.calls.length === 2)
    expect(container.textContent).toBe('2')
  })

  it('does not resurrect a root unmounted during native snapshot capture', async () => {
    const { container, root, render } = setup()
    let set!: (value: number) => void
    const updated = vi.fn()
    function App() { const [value, change] = useState(0); set = change; return <ViewTransition name="unmounted-root" onUpdate={updated}><div>{value}</div></ViewTransition> }
    render(<App />)
    calls.mockImplementation(() => queueMicrotask(() => flushSync(() => root.unmount())))
    startTransition(() => set(1))
    await until(() => transitions.length === 1)
    await transitions[0]!.finished
    expect(container.textContent).toBe('')
    expect(updated).not.toHaveBeenCalled()
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(container.textContent).toBe('')
  })

  it('does not invoke the browser transition API when no boundary participates', async () => {
    const { container, render } = setup()
    let set!: (value: number) => void
    function App() { const [value, change] = useState(0); set = change; return <div>{value}</div> }
    render(<App />)
    startTransition(() => set(1))
    await until(() => container.textContent === '1')
    expect(calls).not.toHaveBeenCalled()
  })

  it('keeps ready animations and later callbacks alive after a callback synchronously changes state', async () => {
    const { container, render } = setup()
    let set!: (value: number) => void
    const cleanup = vi.fn(), later = vi.fn()
    const updated = vi.fn(() => { flushSync(() => set(2)); return cleanup })
    function App() {
      const [value, change] = useState(0); set = change
      return <><ViewTransition name="callback-update" onUpdate={updated}><div>{value}</div></ViewTransition><ViewTransition name="callback-later" onUpdate={later}><div>{value}</div></ViewTransition></>
    }
    render(<App />)
    const transition = await animate(() => set(1))
    await until(() => updated.mock.calls.length === 1)
    expect(later).toHaveBeenCalledTimes(1)
    expect(cleanup).not.toHaveBeenCalled()
    expect(container.textContent).toBe('22')
    transition.skipTransition()
    await transition.finished
    await until(() => cleanup.mock.calls.length === 1)
    expect(container.textContent).toBe('22')
    expect(updated).toHaveBeenCalledTimes(1)
  })

  it('defers unmounted passive cleanup until the exit animation finishes', async () => {
    const { container, render } = setup()
    const events: string[] = []
    let set!: (value: boolean) => void
    const exited = vi.fn(() => { events.push('exit'); return () => { events.push('animation-cleanup') } })
    function Child() {
      useLayoutEffect(() => () => { events.push('layout-cleanup') }, [])
      useEffect(() => { events.push('passive-mounted'); return () => { events.push('passive-cleanup') } }, [])
      return <ViewTransition name="exit-cleanup" onExit={exited}><div ref={() => () => { events.push('ref-cleanup') }}>leaving</div></ViewTransition>
    }
    function App() { const [show, change] = useState(true); set = change; return show ? <Child /> : null }
    render(<App />)
    await until(() => events.includes('passive-mounted')); events.length = 0
    const transition = await animate(() => set(false))
    await until(() => exited.mock.calls.length === 1)
    expect(container.textContent).toBe('')
    expect(events).toEqual(['layout-cleanup', 'ref-cleanup', 'exit'])
    transition.skipTransition(); await transition.finished
    await until(() => events.includes('passive-cleanup'))
    expect(events).toEqual(['layout-cleanup', 'ref-cleanup', 'exit', 'passive-cleanup', 'animation-cleanup'])
  })

  it('captures same-document portal hosts through a ViewTransition outside the portal', async () => {
    const { render } = setup()
    const portal = document.createElement('div')
    document.body.appendChild(portal); cleanups.push(() => portal.remove())
    let set!: (value: number) => void
    const updated = vi.fn()
    function App() { const [value, change] = useState(0); set = change; return <ViewTransition name="portal-host" onUpdate={updated}>{createPortal(<div>{value}</div>, portal)}</ViewTransition> }
    render(<App />)
    await animate(() => set(1))
    expect(portal.textContent).toBe('1')
    expect(pseudos()).toContain('::view-transition-old(portal-host)')
    expect(pseudos()).toContain('::view-transition-new(portal-host)')
    expect(getComputedStyle(document.documentElement, '::view-transition-group(portal-host)').opacity).toBe('1')
  })
})

it.runIf(!!native)('renders transition updates without native browser support', async () => {
  const { container, render } = setup()
  const descriptor = Object.getOwnPropertyDescriptor(document, 'startViewTransition')
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined })
  try {
    let set!: (value: number) => void
    const update = vi.fn()
    function App() { const [value, change] = useState(0); set = change; return <ViewTransition onUpdate={update}><div>{value}</div></ViewTransition> }
    render(<App />)
    startTransition(() => set(1))
    await until(() => container.textContent === '1')
    expect(update).not.toHaveBeenCalled()
    expect(calls).not.toHaveBeenCalled()
  } finally {
    if (descriptor) Object.defineProperty(document, 'startViewTransition', descriptor)
    else delete (document as any).startViewTransition
  }
})

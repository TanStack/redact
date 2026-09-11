import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewTransition, startTransition, useInsertionEffect, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { ReactNode } from 'react'

declare const __TRANSITION_IMAGE_FIXTURES__: boolean
const native = typeof __TRANSITION_IMAGE_FIXTURES__ !== 'undefined' && __TRANSITION_IMAGE_FIXTURES__
  ? document.startViewTransition?.bind(document) : undefined
const transitions: globalThis.ViewTransition[] = []
const cleanups: Array<() => void> = []
const releases: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  await Promise.all(releases.splice(0).map(release => release()))
  for (const transition of transitions.splice(0)) {
    transition.skipTransition()
    await transition.finished.catch(() => {})
  }
  vi.restoreAllMocks()
})

async function until(check: () => boolean) {
  await vi.waitFor(() => expect(check()).toBe(true), { timeout: 5000, interval: 10 })
}

function imageSource(kind: 'image' | 'font' = 'image') {
  const key = Math.random().toString(36).slice(2)
  const src = `/__transition_${kind}?key=${key}`
  const release = async (failed = false) => {
    await fetch(`/__transition_image_release?key=${key}${failed ? '&failed=1' : ''}`)
  }
  releases.push(() => release())
  return { src, release }
}

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let unmounted = false
  function unmount() { if (!unmounted) { unmounted = true; flushSync(() => root.unmount()) } }
  cleanups.push(() => { unmount(); container.remove() })
  const style = document.createElement('style')
  style.textContent = '::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation-duration: .02s; }'
  document.head.appendChild(style)
  cleanups.push(() => style.remove())
  vi.spyOn(document, 'startViewTransition').mockImplementation((options: any) => {
    const transition = native!(options)
    transition.ready.catch(() => {})
    transitions.push(transition)
    return transition
  })
  const decoded: HTMLImageElement[] = []
  const decode = HTMLImageElement.prototype.decode
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(function (this: HTMLImageElement) {
    decoded.push(this)
    return decode.call(this)
  })
  return { container, decoded, unmount, render: (node: ReactNode) => flushSync(() => root.render(node)) }
}

describe.runIf(!!native)('native transition resources', () => {
  it.each([false, true])('waits for a newly mounted image decode before capture, failed=%s', async failed => {
    const source = imageSource()
    const { container, decoded, render } = setup()
    const layouts: number[] = []
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      useLayoutEffect(() => { layouts.push(value) }, [value])
      return <ViewTransition name="image-decode"><div>{value}{value ? <img src={source.src} width={8} height={8} /> : null}</div></ViewTransition>
    }
    render(<App />)
    startTransition(() => set(1))
    await until(() => decoded.length > 0)
    expect(transitions).toHaveLength(0)
    expect(container.querySelector('img')).toBe(null)
    expect(layouts).toEqual([0])
    await source.release(failed)
    await until(() => transitions.length === 1)
    await transitions[0]!.ready
    const image = container.querySelector('img')!
    // React reassigns src when mounting an image, which can restart a failed
    // request. A failed decode must not prevent the transition from completing.
    if (failed) await until(() => image.complete)
    expect(image.complete).toBe(true)
    expect(image.naturalWidth).toBe(failed ? 0 : 1)
    expect(layouts).toEqual([0, 1])
  })

  it('waits for a visible image after the pre-capture decode deadline', async () => {
    const source = imageSource()
    const { container, render } = setup()
    const layouts: number[] = []
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      useLayoutEffect(() => { layouts.push(value) }, [value])
      return <ViewTransition name="image-after-mutation"><div>{value}{value ? <img src={source.src} width={8} height={8} /> : null}</div></ViewTransition>
    }
    render(<App />)
    startTransition(() => set(1))
    await until(() => container.querySelector('img') !== null)
    expect(transitions).toHaveLength(1)
    expect(container.querySelector('img')!.complete).toBe(false)
    expect(layouts).toEqual([0])
    let committed = false
    transitions[0]!.updateCallbackDone.then(() => { committed = true })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(committed).toBe(false)
    await source.release()
    await transitions[0]!.ready
    expect(container.querySelector('img')!.naturalWidth).toBe(1)
    expect(layouts).toEqual([0, 1])
  })

  it('bounds the in-capture image wait when the image never arrives', async () => {
    const source = imageSource()
    const { container, render } = setup()
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      return <ViewTransition name="image-timeout"><div>{value}{value ? <img src={source.src} width={8} height={8} /> : null}</div></ViewTransition>
    }
    render(<App />)
    startTransition(() => set(1))
    await until(() => container.querySelector('img') !== null)
    const started = performance.now()
    await transitions[0]!.updateCallbackDone
    expect(performance.now() - started).toBeGreaterThan(350)
    expect(performance.now() - started).toBeLessThan(1500)
    expect(container.querySelector('img')!.complete).toBe(false)
  })

  it.each(['lazy', 'onLoad', 'outside', 'unchanged', 'no-src'] as const)('does not wait for %s images', async kind => {
    const source = imageSource()
    const { container, decoded, render } = setup()
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      const image = <img src={kind === 'no-src' ? undefined : source.src} srcSet={kind === 'no-src' ? source.src : undefined}
        width={8} height={8} loading={kind === 'lazy' ? 'lazy' : undefined}
        onLoad={kind === 'onLoad' ? () => {} : undefined} />
      return <>{kind === 'outside' && value ? image : null}<ViewTransition name="image-excluded"><div>{value}
        {kind !== 'outside' && (value || kind === 'unchanged') ? image : null}</div></ViewTransition></>
    }
    render(<App />)
    startTransition(() => set(1))
    await until(() => transitions.length === 1)
    await transitions[0]!.ready
    expect(container.querySelector('img')!.complete).toBe(false)
    expect(decoded).toHaveLength(0)
  })

  it.each(['src', 'srcSet'] as const)('waits for changed %s when the previous image was still pending', async kind => {
    const first = imageSource(), second = imageSource()
    const { container, decoded, render } = setup()
    const layouts: number[] = []
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      useLayoutEffect(() => { layouts.push(value) }, [value])
      return <ViewTransition name="image-source"><div>{value}<img width={8} height={8}
        src={kind === 'src' && value ? second.src : first.src}
        srcSet={kind === 'srcSet' && value ? second.src : undefined} /></div></ViewTransition>
    }
    render(<App />)
    const image = container.querySelector('img')!
    startTransition(() => set(1))
    await until(() => decoded.length > 0)
    expect(transitions).toHaveLength(0)
    await first.release()
    await until(() => container.textContent === '1')
    expect(container.querySelector('img')).toBe(image)
    expect(image.complete).toBe(false)
    expect(layouts).toEqual([0])
    await second.release()
    await transitions[0]!.ready
    expect(image.naturalWidth).toBe(1)
    expect(layouts).toEqual([0, 1])
  })

  it('matches the loaded-old-source policy when an existing image changes src', async () => {
    const first = imageSource(), second = imageSource()
    const { container, decoded, render } = setup()
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      return <ViewTransition name="image-loaded-source"><div>{value}<img width={8} height={8}
        src={value ? second.src : first.src} /></div></ViewTransition>
    }
    await first.release()
    render(<App />)
    const image = container.querySelector('img')!
    await until(() => image.complete && image.naturalWidth === 1)
    startTransition(() => set(1))
    await until(() => transitions.length === 1)
    await transitions[0]!.updateCallbackDone
    expect(decoded).toContain(image)
    expect(container.textContent).toBe('1')
    // React chooses post-mutation candidates before changing src. An image
    // that was already complete is not in that list, even if the new src waits.
    expect(image.complete).toBe(false)
  })

  it('uses the short decode deadline and skips capture waits above the image budget', async () => {
    const source = imageSource()
    const { container, decoded, render } = setup()
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      return <ViewTransition name="image-budget"><div style={{ width: 8, height: 8, overflow: 'hidden' }}>{value}
        {value ? <img src={source.src} width={100000} height={100000} /> : null}</div></ViewTransition>
    }
    render(<App />)
    startTransition(() => set(1))
    await until(() => decoded.length > 0)
    const started = performance.now()
    await until(() => transitions.length === 1)
    await transitions[0]!.updateCallbackDone
    expect(performance.now() - started).toBeLessThan(400)
    expect(container.querySelector('img')!.complete).toBe(false)
  })

  it('waits for newly discovered fonts and images together before layout effects', async () => {
    const source = imageSource()
    const { container, render } = setup()
    const layouts: number[] = []
    let set!: (value: number) => void, releaseFonts!: () => void, loading = false
    const ready = new Promise<FontFaceSet>(resolve => { releaseFonts = () => { loading = false; resolve(document.fonts) } })
    releases.push(async () => releaseFonts())
    vi.spyOn(document.fonts, 'status', 'get').mockImplementation(() => loading ? 'loading' : 'loaded')
    vi.spyOn(document.fonts, 'ready', 'get').mockImplementation(() => ready)
    function App() {
      const [value, update] = useState(0); set = update
      useInsertionEffect(() => { if (value) loading = true }, [value])
      useLayoutEffect(() => { layouts.push(value) }, [value])
      return <ViewTransition name="image-and-fonts"><div>{value}{value ? <img src={source.src} width={8} height={8} /> : null}</div></ViewTransition>
    }
    render(<App />)
    startTransition(() => set(1))
    await until(() => container.querySelector('img') !== null)
    expect(layouts).toEqual([0])
    await source.release()
    await until(() => container.querySelector('img')!.complete)
    expect(layouts).toEqual([0])
    releaseFonts()
    await transitions[0]!.ready
    expect(layouts).toEqual([0, 1])
  })

  it('waits for a real newly discovered font request together with an image', async () => {
    const source = imageSource(), font = imageSource('font')
    const { container, render } = setup()
    const family = `transition-font-${Math.random().toString(36).slice(2)}`
    const face = new FontFace(family, `url("${font.src}")`)
    cleanups.push(() => { document.fonts.delete(face) })
    const layouts: number[] = []
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      useInsertionEffect(() => { if (value) document.fonts.add(face) }, [value])
      useLayoutEffect(() => { layouts.push(value) }, [value])
      return <ViewTransition name="actual-image-and-font"><div style={{ fontFamily: value ? family : undefined }}>
        {value}{value ? <img src={source.src} width={8} height={8} /> : null}</div></ViewTransition>
    }
    await document.fonts.ready
    render(<App />)
    startTransition(() => set(1))
    await until(() => face.status === 'loading' && container.querySelector('img') !== null)
    expect(layouts).toEqual([0])
    await source.release()
    await until(() => container.querySelector('img')!.complete)
    expect(layouts).toEqual([0])
    await font.release()
    await transitions[0]!.ready
    expect(face.status).toBe('loaded')
    expect(layouts).toEqual([0, 1])
  })

  it('does not wait after mutation for an image outside the viewport', async () => {
    const source = imageSource()
    const { container, render } = setup()
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      return <ViewTransition name="image-offscreen"><div>{value}{value ?
        <img src={source.src} width={8} height={8} style={{ position: 'absolute', top: 100000 }} /> : null}</div></ViewTransition>
    }
    render(<App />)
    startTransition(() => set(1))
    await until(() => transitions.length === 1)
    const started = performance.now()
    await transitions[0]!.updateCallbackDone
    expect(performance.now() - started).toBeLessThan(350)
    expect(container.querySelector('img')!.complete).toBe(false)
  })

  it.each(['decode', 'capture'] as const)('flushes urgent work without waiting for the image during %s', async phase => {
    const source = imageSource()
    const { container, decoded, render } = setup()
    const layouts: number[] = []
    const updated = vi.fn()
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      useLayoutEffect(() => { layouts.push(value) }, [value])
      return <ViewTransition name="image-urgent" onUpdate={updated}><div>{value}
        {value ? <img src={source.src} width={8} height={8} /> : null}</div></ViewTransition>
    }
    render(<App />)
    startTransition(() => set(1))
    if (phase === 'decode') await until(() => decoded.length > 0)
    else await until(() => container.querySelector('img') !== null)
    flushSync(() => set(2))
    expect(container.textContent).toBe('2')
    expect(container.querySelector('img')!.complete).toBe(false)
    expect(layouts.filter(value => value === 2)).toHaveLength(1)
    await source.release()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(container.textContent).toBe('2')
    expect(updated).not.toHaveBeenCalled()
  })

  it.each(['decode', 'capture'] as const)('can unmount while waiting for the image during %s', async phase => {
    const source = imageSource()
    const { container, decoded, unmount, render } = setup()
    const updated = vi.fn()
    let set!: (value: number) => void
    function App() {
      const [value, update] = useState(0); set = update
      return <ViewTransition name="image-unmount" onUpdate={updated}><div>{value}
        {value ? <img src={source.src} width={8} height={8} /> : null}</div></ViewTransition>
    }
    render(<App />)
    startTransition(() => set(1))
    if (phase === 'decode') await until(() => decoded.length > 0)
    else await until(() => container.querySelector('img') !== null)
    unmount()
    expect(container.childNodes).toHaveLength(0)
    await source.release()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(container.childNodes).toHaveLength(0)
    expect(updated).not.toHaveBeenCalled()
  })
})

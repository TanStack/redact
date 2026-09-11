import { afterEach, describe, expect, it, vi } from 'vitest'
import { Component, ViewTransition, startTransition, useLayoutEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

declare const __REACT_REFERENCE__: boolean

const cleanups: Array<() => void> = []
const transitions: globalThis.ViewTransition[] = []
const releases: Array<() => void | Promise<void>> = []
const native = document.startViewTransition?.bind(document)
afterEach(async () => {
  for (const release of releases.splice(0)) await release()
  for (const transition of transitions.splice(0)) {
    transition.skipTransition()
    await transition.finished.catch(() => {})
  }
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const onUncaughtError = vi.fn(), onRecoverableError = vi.fn()
  const root = createRoot(container, { onUncaughtError, onRecoverableError })
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { root, container, onUncaughtError, onRecoverableError }
}

function track(transition: globalThis.ViewTransition) {
  transition.ready.catch(() => {})
  transition.finished.catch(() => {})
  transition.updateCallbackDone.catch(() => {})
  transitions.push(transition)
  return transition
}

function observeNative(beforeUpdate?: () => Promise<void>, target?: () => boolean) {
  return vi.spyOn(document, 'startViewTransition').mockImplementation((options: any) => {
    const update = typeof options === 'function' ? options : options?.update
    const held = beforeUpdate && (!target || target())
    return track(native!({
      ...typeof options === 'object' ? options : {},
      update: held ? async () => { await beforeUpdate!(); await update?.() } : update,
    }))
  })
}

function controlledNative(target: () => boolean) {
  let rejectReady!: (error: unknown) => void
  let resolveUpdate!: () => void, resolveFinished!: () => void
  let update: ViewTransitionUpdateCallback | null | undefined
  const ready = new Promise<void>((_, reject) => { rejectReady = reject })
  ready.catch(() => {})
  const transition: globalThis.ViewTransition = {
    ready,
    updateCallbackDone: new Promise<void>(resolve => { resolveUpdate = resolve }),
    finished: new Promise<void>(resolve => { resolveFinished = resolve }),
    types: new Set<string>(),
    skipTransition: vi.fn(() => rejectReady(new DOMException('Skipped by caller', 'AbortError'))),
  }
  const capture = vi.fn()
  vi.spyOn(document, 'startViewTransition').mockImplementation(options => {
    if (!target()) return track(native!(options))
    capture()
    update = typeof options === 'function' ? options : options?.update
    return transition
  })
  let complete = false
  async function finish() {
    if (complete) return
    complete = true
    await update?.()
    resolveUpdate(); resolveFinished()
    await transition.finished
  }
  releases.push(finish)
  return { capture, rejectReady, finish }
}

describe.runIf(!!native)('independent root failures during a native transition', () => {
  it.each([true, false])('commits the surviving root once and cleans the failed root, failureFirst=%s', async failureFirst => {
    const failed = setup(), survivor = setup()
    const error = new Error('one root failed')
    const commits: number[] = [], cleanup: string[] = []
    let setFailed!: (value: number) => void, setSurvivor!: (value: number) => void
    observeNative()
    function Broken(): ReactNode { throw error }
    function FailedApp() {
      const [value, update] = useState(0); setFailed = update
      useLayoutEffect(() => () => { cleanup.push(failed.container.textContent!) }, [])
      return <ViewTransition name="failed-root"><div>failed {value}{value ? <Broken /> : null}</div></ViewTransition>
    }
    function SurvivingApp() {
      const [value, update] = useState(0); setSurvivor = update
      useLayoutEffect(() => { commits.push(value) }, [value])
      return <ViewTransition name="surviving-root"><div>surviving {value}</div></ViewTransition>
    }
    flushSync(() => failed.root.render(<FailedApp />))
    flushSync(() => survivor.root.render(<SurvivingApp />))
    const survivingNode = survivor.container.firstChild
    startTransition(() => {
      if (failureFirst) { setFailed(1); setSurvivor(1) }
      else { setSurvivor(1); setFailed(1) }
    })
    await vi.waitFor(() => expect(failed.onUncaughtError).toHaveBeenCalledTimes(1))
    expect(failed.container.childNodes).toHaveLength(0)
    expect(cleanup).toEqual(['failed 0'])
    expect(failed.onUncaughtError.mock.calls[0]![0]).toBe(error)
    expect(failed.onUncaughtError.mock.calls[0]![1].componentStack).toContain('Broken')
    await vi.waitFor(() => expect(survivor.container.textContent).toBe('surviving 1'))
    await Promise.all(transitions.map(transition => transition.finished.catch(() => {})))
    expect(survivor.container.firstChild).toBe(survivingNode)
    expect(commits).toEqual([0, 1])
    expect(survivor.onUncaughtError).not.toHaveBeenCalled()
    flushSync(() => setSurvivor(2))
    expect(survivor.container.textContent).toBe('surviving 2')
    expect(commits).toEqual([0, 1, 2])
  })

  it('keeps both prepared survivors when the middle of three roots fails', async () => {
    const first = setup(), failed = setup(), last = setup()
    const roots = [first, failed, last]
    const setters: Array<(value: number) => void> = []
    const renders: number[][] = [[], [], []]
    const commits: number[][] = [[], [], []]
    const snapshots: string[][] = []
    const cleanup: string[] = []
    observeNative()
    function Broken(): ReactNode { throw Error('middle failed') }
    class Snapshot extends Component<{ value: number; index: number }> {
      getSnapshotBeforeUpdate() {
        snapshots.push([String(this.props.index), first.container.textContent!, last.container.textContent!])
        return null
      }
      componentDidUpdate() {}
      render() { return <div>root {this.props.index}: {this.props.value}</div> }
    }
    function App({ index }: { index: number }) {
      const [value, update] = useState(0); setters[index] = update
      renders[index]!.push(value)
      useLayoutEffect(() => { commits[index]!.push(value) }, [value])
      useLayoutEffect(() => () => { cleanup.push(`${index}:${roots[index]!.container.textContent}`) }, [])
      return <ViewTransition name={`three-root-${index}`}>
        {index === 1 && value ? <Broken /> : <Snapshot value={value} index={index} />}
      </ViewTransition>
    }
    for (let index = 0; index < roots.length; index++) flushSync(() => roots[index]!.root.render(<App index={index} />))
    const nodes = [first.container.firstChild, last.container.firstChild]
    startTransition(() => { setters[0]!(1); setters[1]!(1); setters[2]!(1) })
    await vi.waitFor(() => expect(last.container.textContent).toBe('root 2: 1'))
    await Promise.all(transitions.map(transition => transition.finished.catch(() => {})))
    expect(first.container.textContent).toBe('root 0: 1')
    expect(failed.container.textContent).toBe('')
    expect(failed.onUncaughtError).toHaveBeenCalledTimes(1)
    expect(first.onUncaughtError).not.toHaveBeenCalled()
    expect(last.onUncaughtError).not.toHaveBeenCalled()
    expect([first.container.firstChild, last.container.firstChild]).toEqual(nodes)
    expect([renders[0], renders[2]]).toEqual([[0, 1], [0, 1]])
    expect(commits).toEqual([[0, 1], [0], [0, 1]])
    expect(cleanup).toEqual(['1:root 1: 0'])
    expect(snapshots.map(snapshot => [snapshot[0], snapshot[snapshot[0] === '0' ? 1 : 2]])).toEqual([
      ['0', 'root 0: 0'], ['2', 'root 2: 0'],
    ])
    // React starts a separate native transaction for each root. Redact groups
    // the roots, so all of its snapshots must precede every root's mutation.
    if (!__REACT_REFERENCE__) expect(snapshots.map(snapshot => snapshot.slice(1))).toEqual([
      ['root 0: 0', 'root 2: 0'], ['root 0: 0', 'root 2: 0'],
    ])
  })

  it('lets the failed root replace itself from onUncaughtError without losing a prepared survivor', async () => {
    const failed = setup(), survivor = setup()
    const renders: number[] = [], commits: number[] = [], reports: string[] = []
    let setFailed!: (value: boolean) => void, setSurvivor!: (value: number) => void
    observeNative()
    failed.onUncaughtError.mockImplementation(() => {
      reports.push(failed.container.textContent!)
      failed.root.render(<strong>recovered root</strong>)
    })
    function Broken(): ReactNode { throw Error('replace failed root') }
    function FailedApp() {
      const [broken, update] = useState(false); setFailed = update
      return <ViewTransition name="replace-failed-root"><div>{broken ? <Broken /> : 'initial root'}</div></ViewTransition>
    }
    function SurvivingApp() {
      const [value, update] = useState(0); setSurvivor = update
      renders.push(value)
      useLayoutEffect(() => { commits.push(value) }, [value])
      return <ViewTransition name="replace-failed-survivor"><div>survivor {value}</div></ViewTransition>
    }
    flushSync(() => { failed.root.render(<FailedApp />); survivor.root.render(<SurvivingApp />) })
    startTransition(() => { setFailed(true); setSurvivor(1) })
    await vi.waitFor(() => expect(failed.container.textContent).toBe('recovered root'))
    await vi.waitFor(() => expect(survivor.container.textContent).toBe('survivor 1'))
    await Promise.all(transitions.map(transition => transition.finished.catch(() => {})))
    expect(survivor.container.textContent).toBe('survivor 1')
    expect(reports).toEqual([''])
    expect(failed.onUncaughtError).toHaveBeenCalledTimes(1)
    expect(survivor.onUncaughtError).not.toHaveBeenCalled()
    expect(renders).toEqual([0, 1])
    expect(commits).toEqual([0, 1])
  })

  it('reports native rejection to a surviving root and permits its callback to replace the root', async () => {
    const failed = setup(), survivor = setup()
    const controlled = controlledNative(() => !!(survivor.container.firstElementChild as HTMLElement)?.style.viewTransitionName)
    const commits: number[] = [], reports: string[] = []
    let setFailed!: (value: boolean) => void, setSurvivor!: (value: number) => void
    survivor.onRecoverableError.mockImplementation(() => {
      reports.push(survivor.container.textContent!)
      flushSync(() => survivor.root.render(<strong>recoverable replacement</strong>))
    })
    function Broken(): ReactNode { throw Error('failed before capture') }
    function FailedApp() {
      const [broken, update] = useState(false); setFailed = update
      return <ViewTransition name="rejection-failed-root"><div>{broken ? <Broken /> : 'old failed root'}</div></ViewTransition>
    }
    function SurvivingApp() {
      const [value, update] = useState(0); setSurvivor = update
      useLayoutEffect(() => { commits.push(value) }, [value])
      return <ViewTransition name="rejection-survivor"><div>survivor {value}</div></ViewTransition>
    }
    flushSync(() => { failed.root.render(<FailedApp />); survivor.root.render(<SurvivingApp />) })
    startTransition(() => { setFailed(true); setSurvivor(1) })
    await vi.waitFor(() => expect(controlled.capture).toHaveBeenCalledTimes(1))
    controlled.rejectReady(new DOMException('Survivor capture failed', 'InvalidStateError'))
    await vi.waitFor(() => expect(survivor.container.textContent).toBe('recoverable replacement'))
    await controlled.finish()
    expect(failed.container.textContent).toBe('')
    expect(failed.onUncaughtError).toHaveBeenCalledTimes(1)
    expect(failed.onRecoverableError).not.toHaveBeenCalled()
    expect(survivor.onUncaughtError).not.toHaveBeenCalled()
    expect(survivor.onRecoverableError).toHaveBeenCalledTimes(1)
    expect(reports).toEqual(['survivor 0'])
    expect(commits).toEqual([0, 1])
    expect(survivor.container.textContent).toBe('recoverable replacement')
  })

  it('consumes the surviving plan exactly once when an urgent update interrupts native capture', async () => {
    const failed = setup(), survivor = setup()
    let release!: () => void
    let capturing = false
    const gate = new Promise<void>(resolve => { release = resolve })
    releases.push(release)
    observeNative(async () => { capturing = true; await gate },
      () => !!(survivor.container.firstElementChild as HTMLElement)?.style.viewTransitionName)
    const commits: number[] = [], renders: number[] = []
    let setFailed!: (value: boolean) => void, setSurvivor!: (value: number) => void
    function Broken(): ReactNode { throw Error('failed before urgent update') }
    function FailedApp() {
      const [broken, update] = useState(false); setFailed = update
      return <ViewTransition name="urgent-failed-root"><div>{broken ? <Broken /> : 'old failed root'}</div></ViewTransition>
    }
    function SurvivingApp() {
      const [value, update] = useState(0); setSurvivor = update
      renders.push(value)
      useLayoutEffect(() => { commits.push(value) }, [value])
      return <ViewTransition name="urgent-survivor"><div>survivor {value}</div></ViewTransition>
    }
    flushSync(() => { failed.root.render(<FailedApp />); survivor.root.render(<SurvivingApp />) })
    startTransition(() => { setFailed(true); setSurvivor(1) })
    await vi.waitFor(() => expect(capturing).toBe(true))
    expect(survivor.container.textContent).toBe('survivor 0')
    flushSync(() => setSurvivor(2))
    expect(survivor.container.textContent).toBe('survivor 2')
    expect(failed.container.textContent).toBe('')
    expect(failed.onUncaughtError).toHaveBeenCalledTimes(1)
    expect(survivor.onUncaughtError).not.toHaveBeenCalled()
    expect(commits).toEqual([0, 1, 2])
    expect(renders).toEqual([0, 1, 2])
    release()
    await Promise.all(transitions.map(transition => transition.finished.catch(() => {})))
    expect(survivor.container.textContent).toBe('survivor 2')
    expect(commits).toEqual([0, 1, 2])
    expect(survivor.onRecoverableError).not.toHaveBeenCalled()
  })
})

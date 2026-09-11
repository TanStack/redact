import { expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

declare const __REACT_REFERENCE__: boolean

type Source = 'root-props' | 'suspended-component' | 'gate-state' | 'primary-ancestor' | 'boundary-ancestor'

it.each<Source>(['root-props', 'suspended-component', 'gate-state', 'primary-ancestor', 'boundary-ancestor'])('traces hidden primary work resumed by %s', source => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const pending = new Promise<void>(() => {})
  const dispatches: React.Dispatch<number>[] = []
  const trace: string[] = []
  const phases: unknown[] = []
  let blockGate!: () => void
  let unblockGate!: () => void
  let setPrimaryBlocked!: React.Dispatch<React.SetStateAction<boolean>>
  let setAncestorBlocked!: React.Dispatch<React.SetStateAction<boolean>>

  function Counter({ id, factor }: { id: number, factor: number }) {
    const [value, dispatch] = React.useReducer((previous: number, action: number) => {
      const next = previous * 2 + action * factor
      trace.push(`R${id}(${previous},${action},f${factor})=${next}`)
      return next
    }, id)
    dispatches[id] = dispatch
    trace.push(`C${id}(${value},f${factor})`)
    React.useLayoutEffect(() => {
      trace.push(`L${id}(${value})`)
      return () => { trace.push(`D${id}(${value})`) }
    }, [value])
    return <b data-probe-row={id}>{id}:{value}</b>
  }

  function Gate({ blocked }: { blocked: boolean }) {
    const [resolved, setResolved] = React.useState(false)
    blockGate = () => setResolved(true)
    unblockGate = () => setResolved(source !== 'gate-state')
    trace.push(`G(${Number(blocked)},${Number(resolved)})`)
    if (source === 'gate-state' ? resolved : blocked && !resolved) throw pending
    return null
  }

  function Fallback() {
    trace.push('F')
    React.useLayoutEffect(() => {
      trace.push('FL')
      return () => { trace.push('FD') }
    }, [])
    return <i>pending</i>
  }

  const rows = (factor: number, blocked: boolean) => <section>
    {[0, 1, 2].map(id => React.createElement(Counter, { key: id, id, factor }))}
    <Gate blocked={blocked} />
  </section>
  const suspense = (children: React.ReactNode) => <React.Suspense fallback={<Fallback />}>{children}</React.Suspense>

  function Primary({ factor }: { factor: number }) {
    const [blocked, setBlocked] = React.useState(false)
    setPrimaryBlocked = setBlocked
    trace.push(`P(${Number(blocked)})`)
    return rows(factor, blocked)
  }

  function Ancestor({ factor }: { factor: number }) {
    const [blocked, setBlocked] = React.useState(false)
    setAncestorBlocked = setBlocked
    trace.push(`A(${Number(blocked)})`)
    return suspense(rows(factor, blocked))
  }

  const view = (factor: number, blocked = false) => source === 'primary-ancestor'
    ? suspense(<Primary factor={factor} />)
    : source === 'boundary-ancestor' ? <Ancestor factor={factor} /> : suspense(rows(factor, blocked))
  const phase = (name: string, work: () => void) => {
    const start = trace.length
    flushSync(work)
    const order = trace.slice(start)
    phases.push({
      name,
      counters: order.filter(event => /^C\d/.test(event)).length,
      reducers: order.filter(event => /^R\d/.test(event)).length,
      gate: order.filter(event => event.startsWith('G(')).length,
      primary: order.filter(event => event.startsWith('P(')).length,
      ancestor: order.filter(event => event.startsWith('A(')).length,
      fallback: order.filter(event => event === 'F').length,
      layouts: order.filter(event => /^L\d/.test(event)).length,
      hidden: container.querySelector('section')?.style.display === 'none',
      pending: !!container.querySelector('i'),
      rows: Array.from(container.querySelectorAll('b'), node => node.textContent),
      order,
    })
  }

  try {
    phase('mount', () => root.render(view(1)))
    phase('hide', () => {
      if (source === 'primary-ancestor') setPrimaryBlocked(true)
      else if (source === 'boundary-ancestor') setAncestorBlocked(true)
      else if (source === 'gate-state') blockGate()
      else root.render(view(1, true))
    })
    expect(container.querySelector('i')?.textContent).toBe('pending')
    phase('sibling-actions', () => {
      for (const dispatch of dispatches) { dispatch(1); dispatch(2) }
    })
    phase('unblock', () => {
      if (source === 'primary-ancestor') setPrimaryBlocked(false)
      else if (source === 'boundary-ancestor') setAncestorBlocked(false)
      else if (source === 'suspended-component' || source === 'gate-state') unblockGate()
      else root.render(view(4))
    })
    // An explicit parent render completes any work deferred by the reference
    // runtime. The preceding phase still records what flushSync itself did.
    const factor = source === 'root-props' ? 4 : 1
    phase('confirm', () => root.render(view(factor)))
    expect(container.querySelector('i')).toBeNull()
    expect(container.querySelector('section')?.style.display).not.toBe('none')
    expect(Array.from(container.querySelectorAll('b'), node => node.textContent)).toEqual([0, 1, 2].map(id => `${id}:${id * 4 + factor * 4}`))
    console.log('SUSPENSE_WORK_PROBE ' + JSON.stringify({
      runtime: __REACT_REFERENCE__ ? 'React' : 'Redact',
      version: React.version,
      source,
      phases,
    }))
  } finally {
    flushSync(() => root.unmount())
    container.remove()
  }
})

import { expect, it } from 'vitest'
import { Activity, createElement, useState, useLayoutEffect } from '@tanstack/redact'
import { createRoot } from '@tanstack/redact/dom-client'
import { flushSync } from '@tanstack/redact/dom'
import '../packages/redact/src/dom/features/activity/stub'

it('the explicitly disabled Activity feature unmounts hidden content and remounts fresh state', () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  const log: string[] = []
  let update!: (value: number) => void
  function Child() {
    const [value, set] = useState(1)
    update = set
    useLayoutEffect(() => { log.push('mount'); return () => { log.push('unmount') } }, [])
    return createElement('b', null, value)
  }
  const tree = (mode: 'hidden' | 'visible') => createElement(Activity, { mode }, createElement(Child, null))
  try {
    flushSync(() => root.render(tree('visible')))
    const original = container.firstChild
    flushSync(() => update(7))
    expect(container.textContent).toBe('7')
    flushSync(() => root.render(tree('hidden')))
    expect(container.childNodes).toHaveLength(0)
    expect(log).toEqual(['mount', 'unmount'])
    flushSync(() => root.render(tree('visible')))
    expect(container.textContent).toBe('1')
    expect(container.firstChild).not.toBe(original)
    expect(log).toEqual(['mount', 'unmount', 'mount'])
  } finally { flushSync(() => root.unmount()) }
})

import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createPortal, flushSync } from 'react-dom'
import { act } from 'react-dom/test-utils'

describe('hydration recovery lifecycle', () => {
  it.each(['passive', 'layout'] as const)(
    'does not install abandoned %s subscriptions after document recovery',
    async (effectType) => {
      const doc = new DOMParser().parseFromString(
        '<!doctype html><html><head><title>Search</title></head><body><p>server</p></body></html>',
        'text/html',
      )
      const originalHtml = doc.documentElement
      const originalHead = doc.head
      const originalBody = doc.body
      const subscriptions = new Set<() => void>()
      const useEffect = effectType === 'passive' ? React.useEffect : React.useLayoutEffect

      function Search() {
        const [open, setOpen] = React.useState(false)
        useEffect(() => {
          const onSearch = () => setOpen(true)
          subscriptions.add(onSearch)
          doc.addEventListener('search', onSearch)
          return () => {
            subscriptions.delete(onSearch)
            doc.removeEventListener('search', onSearch)
          }
        }, [])
        return open
          ? createPortal(<input aria-label="Search" />, doc.body)
          : null
      }

      function App() {
        return (
          <html>
            <head><title>Search</title></head>
            <body>
              <Search />
              <p>client</p>
            </body>
          </html>
        )
      }

      const errors: unknown[] = []
      let root: ReturnType<typeof hydrateRoot>
      await act(() => {
        root = hydrateRoot(doc, <App />, {
          onRecoverableError: (error) => errors.push(error),
        })
      })
      try {
        expect(errors).toHaveLength(1)
        expect(doc.documentElement).toBe(originalHtml)
        expect(doc.head).toBe(originalHead)
        expect(doc.body).toBe(originalBody)
        expect(subscriptions.size).toBe(1)

        await act(() => {
          flushSync(() => doc.dispatchEvent(new Event('search')))
        })
        expect(doc.querySelectorAll('input[aria-label="Search"]')).toHaveLength(1)
      } finally {
        await act(() => root.unmount())
        for (const listener of subscriptions) doc.removeEventListener('search', listener)
      }
      expect(subscriptions.size).toBe(0)
    },
  )

  it('cleans up committed subscriptions and portals before delayed recovery', async () => {
    const doc = new DOMParser().parseFromString(
      '<!doctype html><html><head><title>Search</title></head><body><p>server</p></body></html>',
      'text/html',
    )
    const portalTarget = document.createElement('aside')
    const subscriptions = new Set<() => void>()
    const cleanups: number[] = []
    let resolve!: (value: string) => void
    const pending = new Promise<string>((r) => { resolve = r })
    let abandonedOpen!: () => void

    function Search() {
      const [open, setOpen] = React.useState(false)
      React.useEffect(() => {
        const onSearch = () => setOpen(true)
        abandonedOpen ||= onSearch
        subscriptions.add(onSearch)
        return () => {
          cleanups.push(1)
          subscriptions.delete(onSearch)
        }
      }, [])
      return open ? createPortal(<input aria-label="Search" />, portalTarget) : null
    }

    function Delayed() {
      return <p>{React.use(pending)}</p>
    }

    function App() {
      return (
        <html>
          <head><title>Search</title></head>
          <body><Search /><Delayed /></body>
        </html>
      )
    }

    const errors: unknown[] = []
    const root = hydrateRoot(doc, <App />, {
      onRecoverableError: (error) => errors.push(error),
    })
    try {
      await act(() => {})
      expect(errors).toEqual([])
      expect(subscriptions.size).toBe(1)
      flushSync(abandonedOpen)
      expect(portalTarget.querySelectorAll('input')).toHaveLength(1)

      await act(() => resolve('client'))
      expect(errors).toHaveLength(1)
      expect(cleanups).toHaveLength(1)
      expect(subscriptions.size).toBe(1)
      expect(portalTarget.querySelectorAll('input')).toHaveLength(0)

      flushSync(abandonedOpen)
      expect(portalTarget.querySelectorAll('input')).toHaveLength(0)
      flushSync(() => { for (const open of subscriptions) open() })
      expect(portalTarget.querySelectorAll('input')).toHaveLength(1)
    } finally {
      await act(() => root.unmount())
    }
    expect(subscriptions.size).toBe(0)
    expect(cleanups).toHaveLength(2)
    expect(portalTarget.querySelectorAll('input')).toHaveLength(0)
  })

  it('does not commit class lifecycles from an abandoned hydration attempt', async () => {
    const container = document.createElement('div')
    container.innerHTML = '<p>server</p>'
    const events: string[] = []

    class Subscription extends React.Component {
      componentDidMount() { events.push('mount') }
      componentWillUnmount() { events.push('unmount') }
      render() { return null }
    }

    function App() {
      return <><Subscription /><p>client</p></>
    }

    const errors: unknown[] = []
    let root: ReturnType<typeof hydrateRoot>
    await act(() => {
      root = hydrateRoot(container, <App />, {
        onRecoverableError: (error) => errors.push(error),
      })
    })
    try {
      await act(() => {})
      expect(errors).toHaveLength(1)
      expect(events).toEqual(['mount'])
    } finally {
      await act(() => root.unmount())
    }
    expect(events).toEqual(['mount', 'unmount'])
  })

  it('does not attach callback refs from an abandoned hydration attempt', async () => {
    const container = document.createElement('div')
    container.innerHTML = '<span>stable</span><p>server</p>'
    const attached: Array<HTMLSpanElement | null> = []
    const ref = (node: HTMLSpanElement | null) => { attached.push(node) }

    function App() {
      return <><span ref={ref}>stable</span><p>client</p></>
    }

    let root: ReturnType<typeof hydrateRoot>
    await act(() => {
      root = hydrateRoot(container, <App />, { onRecoverableError() {} })
    })
    const span = container.querySelector('span')
    try {
      expect(attached).toEqual([span])
    } finally {
      await act(() => root.unmount())
    }
    expect(attached).toEqual([span, null])
  })
})

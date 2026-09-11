import { expect, it, vi } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

for (const serverMode of ['visible', 'hidden'] as const) {
  for (const clientMode of ['visible', 'hidden'] as const) {
    it(`hydrates Activity ${serverMode} server markup as ${clientMode} on the client`, async () => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const ref = React.createRef<HTMLElement>()
      const log: string[] = []
      function Child() {
        React.useLayoutEffect(() => { log.push('layout') }, [])
        return <b ref={ref}>activity</b>
      }
      const tree = (mode: 'visible' | 'hidden') => <><React.Activity mode={mode}><Child /></React.Activity><span>after</span></>
      container.innerHTML = renderToString(tree(serverMode))
      const original = container.querySelector('b')
      const sibling = container.querySelector('span')
      const errors: unknown[] = []
      const root = hydrateRoot(container, tree(clientMode), { onRecoverableError: error => errors.push(error) })
      try {
        await vi.waitFor(() => {
          if (clientMode === 'visible') expect(ref.current !== null).toBe(true)
          else expect(container.querySelector('b')?.style.display).toBe('none')
        })
        const host = container.querySelector('b')!
        expect(container.querySelectorAll('b')).toHaveLength(1)
        expect(host.style.display).toBe(clientMode === 'hidden' ? 'none' : '')
        expect(ref.current === (clientMode === 'hidden' ? null : host)).toBe(true)
        expect(log).toEqual(clientMode === 'hidden' ? [] : ['layout'])
        if (serverMode !== clientMode) {
          expect(errors).toHaveLength(1)
        } else {
          expect(errors).toEqual([])
          expect(container.querySelector('span')).toBe(sibling)
          if (original) expect(host).toBe(original)
        }
      } finally {
        flushSync(() => root.unmount())
        container.remove()
      }
    })
  }
}

it('adopts visible React Activity markers without replacing the following sibling', async () => {
  const container = document.createElement('div')
  container.innerHTML = '<!--&--><b>activity</b><!--/&--><span>after</span>'
  document.body.appendChild(container)
  const host = container.querySelector('b')!
  const sibling = container.querySelector('span')!
  const ref = React.createRef<HTMLElement>()
  const errors: unknown[] = []
  const root = hydrateRoot(container, <><React.Activity><b ref={ref}>activity</b></React.Activity><span>after</span></>, {
    onRecoverableError: error => errors.push(error),
  })
  try {
    await vi.waitFor(() => expect(ref.current !== null).toBe(true))
    expect(ref.current === host).toBe(true)
    expect(container.querySelector('span') === sibling).toBe(true)
    expect(errors).toEqual([])
  } finally { flushSync(() => root.unmount()); container.remove() }
})

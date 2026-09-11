import { createElement, useLayoutEffect } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const browser = window as any
const policy = browser.trustedTypes.createPolicy('redact-parity', {
  createHTML: (value: string) => value,
  createScriptURL: (value: string) => value,
})

browser.verifySecurityParity = async (kind: string) => {
  const container = kind === 'nonce-head-hydration' ? document.head : document.getElementById('root')!
  const errors: string[] = []
  const report = (error: unknown) => errors.push(String(error))
  const options = { onRecoverableError: report, onUncaughtError: report, onCaughtError: report }
  const original = container.firstElementChild
  let committed = false
  function Content({ html, nonce }: { html?: string; nonce?: boolean }) {
    useLayoutEffect(() => { committed = true })
    if (kind === 'nonce-head-hydration') return createElement('style', { id: 'nonce-head-target', nonce: 'parity-test' }, 'p {color:red}')
    if (nonce) return createElement('div', { id: 'nonce-target', nonce: 'parity-test' }, 'nonce content')
    if (kind.includes('iframe')) return createElement('iframe', { srcDoc: policy.createHTML(html!) })
    const tag = kind === 'trusted-table-hydration' ? 'table' : kind === 'trusted-svg-hydration' ? 'svg' : 'section'
    return createElement(tag, { dangerouslySetInnerHTML: { __html: policy.createHTML(html!) } })
  }
  const html = kind === 'trusted-table-hydration' ? '<tbody><tr><td>trusted</td></tr></tbody>'
    : kind === 'trusted-svg-hydration' ? '<text>trusted</text>' : '<b>trusted &amp; safe</b>'
  let root: ReturnType<typeof createRoot> | undefined
  try {
    if (kind.endsWith('client')) {
      root = createRoot(container, options)
      flushSync(() => root!.render(createElement(Content, { html })))
      if (kind.includes('iframe')) {
        for (let attempts = 0; container.querySelector('iframe')?.contentDocument?.body?.textContent !== 'trusted & safe' && attempts < 100; attempts++) {
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      }
      flushSync(() => root!.render(createElement(Content, { html: '<i>updated &amp; safe</i>' })))
    } else {
      flushSync(() => { root = hydrateRoot(container, createElement(Content, { html, nonce: kind === 'nonce-hydration' }), options) })
    }
    for (let attempts = 0; !committed && attempts < 100; attempts++) await new Promise(resolve => setTimeout(resolve, 10))
    if (kind.includes('iframe')) {
      const expected = kind.endsWith('client') ? 'updated & safe' : 'trusted & safe'
      for (let attempts = 0; container.querySelector('iframe')?.contentDocument?.body?.textContent !== expected && attempts < 100; attempts++) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
    const result = {
      committed, errors, sameNode: original === container.firstElementChild,
      text: kind.includes('iframe') ? container.querySelector('iframe')?.contentDocument?.body?.textContent : container.textContent,
      nonce: (container.firstElementChild as HTMLElement | null)?.nonce || null,
      nonceAttribute: container.firstElementChild?.getAttribute('nonce'),
    }
    flushSync(() => root!.unmount())
    return result
  } catch (error) {
    return { committed, errors, thrown: String(error) }
  }
}

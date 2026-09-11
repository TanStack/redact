import { describe, expect, it } from 'vitest'
import { createResourceHints } from '../packages/redact/src/server/resource-hints'

describe('streamed resource dependency collection', () => {
  it('emits a preload, not a parser-blocking stylesheet, and keeps dependency options', () => {
    const resources = createResourceHints(true)
    resources.addHost('link', { rel: 'stylesheet', href: '/late.css', precedence: 'theme', crossOrigin: 'anonymous', integrity: 'sha256-css', media: 'screen', className: 'theme', hidden: true, style: { color: 'red' }, 'aria-hidden': false })
    const output = resources.drain()
    expect(output).toContain('rel="preload"')
    expect(output).toContain('as="style"')
    expect(output).not.toContain('rel="stylesheet"')
    expect(output).not.toContain('class=')
    expect(output).not.toContain('hidden=')
    expect(resources.takeStylesheets()).toEqual([['/late.css', 'theme', 'crossorigin', 'anonymous', 'integrity', 'sha256-css', 'media', 'screen', 'class', 'theme', 'hidden', '', 'aria-hidden', 'false']])
    expect(resources.takeStylesheets()).toEqual([])
  })

  it('does not make API-only preinitialization a boundary dependency', () => {
    const resources = createResourceHints(true)
    resources.add('stylesheet', '/hint.css', { precedence: 'theme' })
    expect(resources.drain()).toContain('rel="preload"')
    expect(resources.takeStylesheets()).toEqual([])
  })

  it('tracks a reused late resource for each new boundary without emitting duplicate preloads', () => {
    const resources = createResourceHints(true)
    const props = { rel: 'stylesheet', href: '/shared.css', precedence: 'theme' }
    resources.addHost('link', props)
    expect(resources.drain()).toContain('/shared.css')
    expect(resources.takeStylesheets()).toEqual([['/shared.css', 'theme']])
    resources.addHost('link', props)
    expect(resources.drain()).toBe('')
    expect(resources.takeStylesheets()).toEqual([['/shared.css', 'theme']])
  })

  it('emits late inline rules as inert style groups for activation during reveal', () => {
    const resources = createResourceHints(true)
    resources.addHost('style', { href: '/a', precedence: 'theme', children: 'a{}' })
    resources.addHost('style', { href: '/b', precedence: 'theme', children: 'b{}' })
    expect(resources.drain()).toBe('<style media="not all" data-precedence="theme" data-href="/a /b">a{}b{}</style>')
    expect(resources.takeStylesheets()).toEqual([])
  })
})

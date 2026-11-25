// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { correctVinextModule, vinextVersionSupport } from '../packages/redact/src/vinext/compatibility'
import { redact } from '../packages/redact/src/vinext'

const directory = '/node_modules/vinext/dist'
const stateID = directory + '/client/instrumentation-client-state.js'
const handlerID = directory + '/server/app-rsc-handler.js'
const state = `let clientInstrumentationHooks = null;
function setClientInstrumentationHooks(hooks) { clientInstrumentationHooks = hooks; return clientInstrumentationHooks; }
function getClientInstrumentationHooks() { return clientInstrumentationHooks; }
function notifyAppRouterTransitionStart(href, navigationType) { clientInstrumentationHooks?.onRouterTransitionStart?.(href, navigationType); }
({ setClientInstrumentationHooks, getClientInstrumentationHooks, notifyAppRouterTransitionStart })`

describe('maintained Vinext compatibility', () => {
  it('keeps native React browser resolution available for the same platform corrections', () => {
    const plugin = redact({ renderer: 'react' })
    const config = { consumer: 'client', optimizeDeps: { include: ['react', 'react-dom/client'] } }
    const before = structuredClone(config)
    plugin.configEnvironment.handler('client', config)
    expect(config).toEqual(before)
    for (const id of ['react', 'react-dom/client', 'react/jsx-runtime', 'scheduler']) expect(plugin.resolveId.handler.call({ environment: { config } }, id)).toBeNull()
  })

  it('shares instrumentation hooks between raw and prebundled module instances', () => {
    const corrected = correctVinextModule(state, stateID, directory)!
    const globalThis = {}
    const raw = runInNewContext(corrected, { globalThis })
    const bundled = runInNewContext(corrected, { globalThis })
    const calls: unknown[] = []
    const hooks = { onRouterTransitionStart: (...args: unknown[]) => calls.push(args) }
    expect(raw.getClientInstrumentationHooks()).toBeNull()
    expect(raw.setClientInstrumentationHooks(hooks)).toBe(hooks)
    expect(bundled.getClientInstrumentationHooks()).toBe(hooks)
    bundled.notifyAppRouterTransitionStart('/next', 'push')
    expect(calls).toEqual([['/next', 'push']])
    expect(bundled.setClientInstrumentationHooks(null)).toBeNull()
    raw.notifyAppRouterTransitionStart('/cleared', 'replace')
    expect(calls).toHaveLength(1)
    expect(correctVinextModule(corrected, stateID, directory)).toBeNull()
  })

  it('keeps document canonicalization while preserving Pages JSON URLs', () => {
    const source = '(options, isDataRequest) => { if (!options.skipTrailingSlashRedirect) { return 308; } return 200; }'
    const handler = runInNewContext(correctVinextModule(source, handlerID, directory)!)
    expect(handler({}, true)).toBe(200)
    expect(handler({}, false)).toBe(308)
    expect(handler({ skipTrailingSlashRedirect: true }, false)).toBe(200)
  })

  it('does not transform unrelated modules or silently accept changed framework internals', () => {
    expect(correctVinextModule(state, '/app/client/instrumentation-client-state.js', directory)).toBeNull()
    expect(() => correctVinextModule('different code', stateID, directory)).toThrow('Unsupported Vinext instrumentation')
    expect(() => correctVinextModule('different code', handlerID, directory)).toThrow('Unsupported Vinext Pages')
  })
})

describe('Vinext version support', () => {
  it('treats 1.3.x and 1.4.x stable releases as supported', () => {
    for (const version of ['1.3.0', '1.3.9', '1.4.3', '1.4.4']) expect(vinextVersionSupport(version)).toBe('supported')
  })

  it('warns for prereleases', () => {
    for (const version of ['1.3.5-beta.1', '1.4.0-rc.1', '1.4.4-next.0']) expect(vinextVersionSupport(version)).toBe('prerelease')
  })

  it('warns for untested version families', () => {
    for (const version of ['1.2.9', '1.5.0', '2.0.0', '0.9.0']) expect(vinextVersionSupport(version)).toBe('untested')
  })
})

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Keep a failed reference runtime bounded even if it blocks the event loop.
// This reproduces React 19.3 hydrating initially omitted Activity content as
// visible, with a following sibling. It does not import Redact or Vitest.
if (!process.argv.includes('--child')) {
  const started = Date.now()
  const result = spawnSync(process.execPath, [
    '--max-old-space-size=128', fileURLToPath(import.meta.url), '--child',
  ], { timeout: 5000, encoding: 'utf8', maxBuffer: 128 * 1024 })
  console.log(JSON.stringify({
    elapsedMs: Date.now() - started,
    status: result.status,
    signal: result.signal,
    error: result.error?.code,
    heapExhausted: /heap limit|heap out of memory/.test(result.stderr ?? ''),
    stdout: result.stdout,
    stderrTail: result.stderr?.slice(-2000),
  }, null, 2))
} else {
  const require = createRequire(import.meta.url)
  const { JSDOM } = createRequire(require.resolve('vitest/package.json'))('jsdom')
  const { window } = new JSDOM('<div id="app"><span>after</span></div>')
  globalThis.window = window
  globalThis.document = window.document
  const React = (await import('../benchmarks/reference/node_modules/react/index.js')).default
  const { hydrateRoot } = await import('../benchmarks/reference/node_modules/react-dom/client.js')
  let errors = 0
  const root = hydrateRoot(document.getElementById('app'), React.createElement(React.Fragment, null,
    React.createElement(React.Activity, { mode: 'visible' }, React.createElement('b', null, 'activity')),
    React.createElement('span', null, 'after'),
  ), { onRecoverableError() { errors++ } })
  setTimeout(() => {
    console.log(JSON.stringify({ version: React.version, errors, html: document.body.innerHTML }))
    root.unmount()
  }, 100)
}

// node scripts/hydration-probe-browser.mjs
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { chromium, firefox, webkit, devices } from 'playwright'

const mode = process.env.NODE_ENV || 'production'
const engine = process.env.BROWSER || 'chromium'
const device = process.env.DEVICE || 'desktop'
const source = resolve('packages/redact/src')
const aliases = {
  react: resolve(source, 'react/index.ts'),
  'react-dom/client': resolve(source, 'dom/client.ts'),
}
const cases = ['picture', 'hidden-lazy', 'offscreen-lazy', 'resources', 'inner-html', 'custom', 'noscript', 'noscript-normalization', 'noscript-mismatch', 'native-properties', 'styles', 'noscript-entity-mismatch']
const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: `
    import { createElement as h } from 'react';
    import { hydrateRoot } from 'react-dom/client';
    const name = location.pathname.slice(1);
    const url = path => location.origin + path;
    const nestedHtml = '<img src="/probe/nested.jpg"><hydration-resource-probe label="same"></hydration-resource-probe>'.replace('src="/', 'src="' + location.origin + '/');
    const trees = {
      picture: h('picture', null,
        h('source', {type:'image/webp', srcSet:url('/selected.webp')}),
        h('img', {src:url('/fallback.jpg'), alt:'', width:800, height:600})),
      'hidden-lazy': h('img', {src:url('/probe/hidden.jpg'), loading:'lazy', width:800, height:600}),
      'offscreen-lazy': h('img', {src:url('/probe/offscreen.jpg'), loading:'lazy', width:800, height:600}),
      resources: h('div', null,
        h('img', {srcSet:url('/probe/srcset.jpg 1x')}),
        h('input', {type:'image', src:url('/probe/input.jpg')}),
        h('video', {poster:url('/probe/poster.jpg'), preload:'auto', src:url('/probe/video.mp4')}),
        h('audio', {preload:'auto', src:url('/probe/audio.mp3')}),
        h('svg', null, h('image', {href:url('/probe/svg.jpg')}))),
      'inner-html': h('div', {dangerouslySetInnerHTML:{__html:nestedHtml}}),
      custom: h('hydration-resource-probe', {label:'same', style:{color:'red'}}),
      noscript: h('div', {dangerouslySetInnerHTML:{__html:'<p class=x>visible</p><noscript><IMG SRC="' + url('/probe/noscript.jpg') + '"></noscript>'}}),
      'noscript-normalization': h('div', {dangerouslySetInnerHTML:{__html:'<p class="x">visible</p><noscript><p class=x>fallback</p></noscript>'}}),
      'noscript-mismatch': h('div', {dangerouslySetInnerHTML:{__html:'<noscript><p>changed</p></noscript>'}}),
      'native-properties': h('div', null, h('progress', {value:'2.0'}), h('meter', {value:0.25, min:0, max:1}), h('button', {value:'submit'}, 'submit')),
      styles: h('div', {style:{backgroundImage:'url(' + url('/probe/background.jpg') + ')', margin:0, '--accent':'red'}}, 'style'),
      'noscript-entity-mismatch': h('div', {dangerouslySetInnerHTML:{__html:'<noscript>A</noscript>'}}),
    };
    window.hydrate = () => {
      const container = document.querySelector('main');
      window.originalNode = container.firstChild;
      window.errors = [];
      window.probeWrites = [];
      window.activeHtmlWrites = 0;
      window.customConstructors = 0;
      window.customChanges = 0;
      window.root = hydrateRoot(container, trees[name], {onRecoverableError:e=>window.errors.push(String(e))});
    };
  ` },
  alias: aliases, bundle: true, write: false, format: 'iife',
  define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
})
const markup = {
  picture: '<picture><source type="image/webp" srcset="/selected.webp"><img src="/fallback.jpg" alt="" width="800" height="600"></picture>',
  'hidden-lazy': '<img src="/probe/hidden.jpg" loading="lazy" width="800" height="600">',
  'offscreen-lazy': '<img src="/probe/offscreen.jpg" loading="lazy" width="800" height="600">',
  resources: '<div><img srcset="/probe/srcset.jpg 1x"><input type="image" src="/probe/input.jpg"><video poster="/probe/poster.jpg" preload="auto" src="/probe/video.mp4"></video><audio preload="auto" src="/probe/audio.mp3"></audio><svg><image href="/probe/svg.jpg"></image></svg></div>',
  'inner-html': '<div><img src="/probe/nested.jpg"><hydration-resource-probe label="same"></hydration-resource-probe></div>',
  custom: '<hydration-resource-probe label="same" style="color:red"></hydration-resource-probe>',
  noscript: '<div><p class=x>visible</p><noscript><IMG SRC="/probe/noscript.jpg"></noscript></div>',
  'noscript-normalization': '<div><p class=x>visible</p><noscript><p class=x>fallback</p></noscript></div>',
  'noscript-mismatch': '<div><noscript><p>fallback</p></noscript></div>',
  'native-properties': '<div><progress value="2"></progress><meter value="0.25" min="0" max="1"></meter><button value="submit">submit</button></div>',
  styles: '<div style="background-image:url(/probe/background.jpg);margin:0;--accent:red">style</div>',
  'noscript-entity-mismatch': '<div><noscript>&#65;</noscript></div>',
}
const jpeg = await readFile('tests/fixtures/picture-hydration/fallback.jpg')
const webp = await readFile('tests/fixtures/picture-hydration/selected.webp')
const requests = []
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  res.setHeader('Cache-Control', 'no-store')
  if (path === '/client.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return }
  if (path.startsWith('/probe/') || path === '/fallback.jpg' || path === '/selected.webp') {
    requests.push(path)
    res.setHeader('Content-Type', path.endsWith('.webp') ? 'image/webp' : 'image/jpeg')
    res.end(path.endsWith('.webp') ? webp : jpeg)
    return
  }
  const name = path.slice(1)
  if (!(name in markup)) { res.writeHead(404); res.end(); return }
  const style = name === 'hidden-lazy' ? 'display:none' : name === 'offscreen-lazy' ? 'margin-top:12000px' : ''
  res.setHeader('Content-Type', 'text/html')
  const origin = `http://127.0.0.1:${server.address().port}`
  const html = markup[name].replace(/(src|srcset|poster|href)="\//gi, `$1="${origin}/`).replace('url(/probe/', `url(${origin}/probe/`)
  res.end(`<!doctype html><main style="${style}">${html}</main><script src="/client.js"></script>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const results = []
try {
  browser = await { chromium, firefox, webkit }[engine].launch({
    ...(engine === 'chromium' ? { channel: 'chrome' } : {}),
    headless: true,
  })
  for (const name of cases) {
    const context = await browser.newContext(device === 'desktop'
      ? { viewport: { width: 800, height: 600 } }
      : devices[device])
    try {
      const page = await context.newPage()
      // Routing disables the HTTP cache in all three engines.
      await context.route('**/*', route => route.continue())
      await page.addInitScript(() => {
        window.probeWrites = []
        window.activeHtmlWrites = 0
        window.customConstructors = 0
        window.customChanges = 0
        customElements.define('hydration-resource-probe', class extends HTMLElement {
          static observedAttributes = ['label', 'style']
          constructor() { super(); window.customConstructors++ }
          attributeChangedCallback() { window.customChanges++ }
        })
        const set = Element.prototype.setAttribute
        Element.prototype.setAttribute = function(name, value) {
          if (['src', 'srcset', 'href', 'poster'].includes(name.toLowerCase())) {
            window.probeWrites.push({ tag:this.tagName, name, value, connected:this.isConnected, active:this.ownerDocument.defaultView !== null })
          }
          return set.call(this, name, value)
        }
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
        Object.defineProperty(Element.prototype, 'innerHTML', {
          ...descriptor,
          set(value) {
            if (this.ownerDocument.defaultView !== null) window.activeHtmlWrites++
            return descriptor.set.call(this, value)
          },
        })
      })
      const start = requests.length
      await page.goto(`http://127.0.0.1:${server.address().port}/${name}`)
      await page.waitForLoadState('networkidle')
      const before = requests.slice(start)
      if (name === 'picture') {
        assert.equal(before.includes('/fallback.jpg'), false)
        await page.locator('img').evaluate(image => image.decode())
      }
      if (name.endsWith('lazy')) assert.deepEqual(before, [])
      await page.evaluate(() => window.hydrate())
      await page.waitForTimeout(600)
      const state = await page.evaluate(() => ({
        sameNode:document.querySelector('main').firstChild === window.originalNode,
        errors:window.errors, writes:window.probeWrites, activeHtmlWrites:window.activeHtmlWrites,
        constructors:window.customConstructors, attributeChanges:window.customChanges,
      }))
      const after = requests.slice(start + before.length)
      const result = { name, before, after, ...state }
      results.push(result)
      if (name.endsWith('mismatch')) {
        assert.equal(state.sameNode, false, name)
        assert.equal(state.errors.length, 1, name)
        assert.match(state.errors[0], /Hydration .*mismatch/i, name)
      } else {
        assert.equal(state.sameNode, true, name)
        assert.deepEqual(state.errors, [], name)
      }
      if (name === 'inner-html') {
        // Preserve React-style same-document HTML normalization, including its side effects.
        assert.equal(state.activeHtmlWrites, 1, name)
        assert.equal(state.constructors, 1, name)
        assert.equal(state.attributeChanges, 1, name)
      } else {
        assert.deepEqual(state.writes.filter(write => write.active), [], name)
        assert.equal(state.constructors, 0, name)
        assert.equal(state.attributeChanges, 0, name)
        assert.deepEqual(after, [], name)
      }
      if (!name.endsWith('mismatch') && !['inner-html', 'noscript', 'noscript-normalization'].includes(name)) {
        assert.equal(state.activeHtmlWrites, 0, name)
      }
    } finally { await context.close() }
  }
} finally {
  await mkdir('artifacts', { recursive: true })
  const result = { runtime:'redact', mode, engine, device, platform:process.platform, version:browser?.version(), cases:results }
  await writeFile(`artifacts/hydration-probes-redact-${engine}-${device.replaceAll(' ', '-')}-${mode}.json`, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}

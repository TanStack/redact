import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'

const scripts = process.env.BENCHMARK_SCRIPTS ?? dirname(fileURLToPath(import.meta.url))
async function put(root, file, text) {
  await mkdir(dirname(join(root, file)), { recursive: true })
  await writeFile(join(root, file), text)
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'redact-framework-runner-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
function launch(t, script, args, env = {}) {
  const child = spawn(process.execPath, [join(scripts, script), ...args], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, ...env },
  })
  let stdout = '', stderr = ''
  child.stdout.on('data', bytes => { stdout += bytes })
  child.stderr.on('data', bytes => { stderr += bytes })
  const done = new Promise((accept, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => accept({ code, signal, stdout, stderr }))
  })
  const kill = () => { try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error } }
  t.after(async () => { kill(); await done })
  return { child, done, stdout: () => stdout, stderr: () => stderr }
}
async function eventually(fn, timeout = 4000) {
  const deadline = Date.now() + timeout
  for (;;) {
    try { return await fn() } catch (error) {
      if (Date.now() > deadline) throw error
      await new Promise(accept => setTimeout(accept, 20))
    }
  }
}
async function buildFixture(t, failure = false, inheritedOutput = false) {
  const root = await fixture(t)
  await put(root, 'package.json', '{"dependencies":{}}')
  await put(root, 'package-lock.json', '{}')
  await put(root, 'redact.tgz', 'controlled test fixture')
  const builder = `import {mkdirSync,writeFileSync} from 'node:fs';import{basename,join}from'node:path';import{spawn}from'node:child_process';
const id=basename(process.cwd()),renderer=process.env.RENDERER;
const out=id==='next'?'.next-'+renderer+'/static':id==='vite'?'dist':'dist/client';
mkdirSync(out,{recursive:true});
writeFileSync(join(out,'bundle.js'),renderer==='redact-lean'?'x':'x'.repeat(renderer==='react'?3000:1000));
process.stdout.write('early stdout\\n');process.stdout.end();
if(${inheritedOutput}){spawn(process.execPath,['-e',"setTimeout(()=>process.stderr.write('inherited stderr\\\\n'),60)"],{stdio:['ignore','ignore',process.stderr]});process.exit(0)}
setTimeout(()=>{process.stderr.write('late stderr '+renderer+'\\n');process.exitCode=${failure ? 7 : 0}},30);
`
  for (const file of ['vite/bin/vite.js', 'next/dist/bin/next']) {
    await put(root, 'node_modules/' + file, builder)
  }
  return root
}

test('measurement waits for both output streams and flushes every build log', { timeout: 10000 }, async t => {
  const root = await buildFixture(t)
  const result = await launch(t, 'measure.mjs', [root]).done
  assert.equal(result.code, 0, result.stderr)
  const report = JSON.parse(await readFile(join(root, 'results.json'), 'utf8'))
  assert.equal(report.results.length, 10)
  for (const row of report.results) {
    const app = row.framework === 'Next.js' ? 'next' : row.framework.toLowerCase()
    const log = await readFile(join(root, app, row.renderer + '.log'), 'utf8')
    assert.match(log, /early stdout/)
    assert.ok(log.includes('late stderr ' + row.renderer), log)
  }
})

test('measurement waits for inherited stdio after the build process exits', { timeout: 10000 }, async t => {
  const root = await buildFixture(t, false, true)
  const result = await launch(t, 'measure.mjs', [root]).done
  assert.equal(result.code, 0, result.stderr)
  const report = JSON.parse(await readFile(join(root, 'results.json'), 'utf8'))
  assert.equal(report.results.length, 10)
  for (const row of report.results) {
    const app = row.framework === 'Next.js' ? 'next' : row.framework.toLowerCase()
    assert.match(await readFile(join(root, app, row.renderer + '.log'), 'utf8'), /inherited stderr/)
  }
})

test('measurement preserves the failed build log and stops before the next variant', { timeout: 10000 }, async t => {
  const root = await buildFixture(t, true)
  const result = await launch(t, 'measure.mjs', [root]).done
  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /exited 7/)
  assert.match(await readFile(join(root, 'start/react.log'), 'utf8'), /late stderr react/)
  await assert.rejects(readFile(join(root, 'start/redact.log')), { code: 'ENOENT' })
})

test('measurement reports an unwritable log without leaving its build running', { timeout: 10000 }, async t => {
  const root = await buildFixture(t)
  await mkdir(join(root, 'start/react.log'), { recursive: true })
  const result = await launch(t, 'measure.mjs', [root]).done
  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /EISDIR/)
})

async function previewFixture(t, mode) {
  const root = await fixture(t)
  const preload = `import http from 'node:http';import{syncBuiltinESMExports}from'node:module';import{appendFileSync,readFileSync}from'node:fs';
const framework=process.argv[3],runtime=process.argv[4];
if(framework){
 appendFileSync(${JSON.stringify(join(root, 'pids'))},JSON.stringify({pid:process.pid,framework,runtime})+'\\n');
 process.on('SIGTERM',()=>{if(!(${JSON.stringify(mode)}==='stubborn'&&framework==='vite'&&runtime==='react'))process.exit(0)});
 if(framework==='next'&&runtime==='redact'&&${JSON.stringify(mode)}!=='signal'){const gate=setInterval(()=>{try{if(readFileSync(${JSON.stringify(join(root,'pids'))},'utf8').trim().split('\\n').length===10){clearInterval(gate);process.exit(${mode === 'clean' ? 0 : 7})}}catch{}},20)}
 else setInterval(()=>{},1000);
}
http.createServer=()=>({listen(){return this}});syncBuiltinESMExports();
`
  await put(root, 'preload.mjs', preload)
  for (const app of ['start', 'vite', 'vinext', 'next']) await mkdir(join(root, app), { recursive: true })
  for (const renderer of ['react', 'redact', 'redact-lean']) {
    await put(root, `start/dist-${renderer}/server/package.json`, '{"type":"module"}')
    await put(root, `start/dist-${renderer}/server/server.js`, 'export default {fetch(){return new Response("ok")}}')
  }
  await put(root, 'node_modules/next/package.json', '{"type":"module"}')
  await put(root, 'node_modules/next/dist/bin/next', '')
  await put(root, 'node_modules/vinext/package.json', '{"type":"module"}')
  await put(root, 'node_modules/vinext/dist/server/prod-server.js', 'export async function startProdServer(){}')
  return root
}
for (const mode of ['failure', 'clean', 'stubborn']) test(`all-preview supervisor stops siblings after an unexpected ${mode} exit`, { timeout: 10000 }, async t => {
  const root = await previewFixture(t, mode)
  const result = await launch(t, 'serve.mjs', [root], { NODE_OPTIONS: '--import=' + join(root, 'preload.mjs') }).done
  assert.equal(result.code, 1, result.stderr)
  assert.match(result.stderr, /next\/redact: preview failed/)
  const pids = (await readFile(join(root, 'pids'), 'utf8')).trim().split('\n').map(line => JSON.parse(line).pid)
  assert.equal(pids.length, 10)
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})

test('all-preview supervisor forwards shutdown and waits for every child', { timeout: 10000 }, async t => {
  const root = await previewFixture(t, 'signal')
  const preview = launch(t, 'serve.mjs', [root], { NODE_OPTIONS: '--import=' + join(root, 'preload.mjs') })
  const pids = await eventually(async () => {
    const rows = (await readFile(join(root, 'pids'), 'utf8')).trim().split('\n').map(line => JSON.parse(line).pid)
    assert.equal(rows.length, 10)
    return rows
  })
  preview.child.kill('SIGTERM')
  const result = await preview.done
  assert.equal(result.code, 143, result.stderr)
  assert.doesNotMatch(result.stderr, /preview failed/)
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})

for (const phase of ['early', 'late']) test(phase + ' SSR stream failure closes the response while the preview stays available', { timeout: 10000 }, async t => {
  const root = await fixture(t)
  await put(root, 'start/dist-react/server/package.json', '{"type":"module"}')
  await put(root, 'start/dist-react/server/server.js', `export default {fetch(request){
 if(new URL(request.url).pathname!=='/fail')return new Response('healthy');
 return new Response(new ReadableStream({start(controller){${phase === 'late' ? "controller.enqueue(new TextEncoder().encode('partial'));setTimeout(()=>controller.error(new Error('controlled stream failure')),30)" : "controller.error(new Error('controlled stream failure'))"}}}))
}}`)
  const socket = createServer()
  await new Promise(accept => socket.listen(0, '127.0.0.1', accept))
  const port = socket.address().port
  await new Promise(accept => socket.close(accept))
  const preview = launch(t, 'serve.mjs', [root, 'start', 'react', String(port)])
  const url = `http://127.0.0.1:${port}`
  await eventually(async () => assert.equal(await (await fetch(url)).text(), 'healthy'))
  await assert.rejects(async () => (await fetch(url + '/fail')).text())
  assert.equal(await (await fetch(url)).text(), 'healthy')
  assert.equal(preview.child.exitCode, null)
  assert.match(preview.stderr(), /controlled stream failure/)
})

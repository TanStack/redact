// Build the local perf-bench app, serve it via vite preview, and run the
// browser bench against it (compared to the deployed React reference).
//
// Real Chrome only — see scripts/browser-bench.mjs for the rationale.
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'

const cwd = new URL('..', import.meta.url).pathname

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd, ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log('• Building examples/perf-bench …')
run('pnpm', ['--filter', 'perf-bench', 'build'])

console.log('• Starting preview server on http://localhost:4173 …')
// `examples/perf-bench`'s `preview` script already pins port 4173+strictPort.
const preview = spawn(
  'pnpm',
  ['--filter', 'perf-bench', 'preview'],
  { cwd, stdio: ['ignore', 'pipe', 'inherit'] },
)

let ready = false
preview.stdout.on('data', (b) => {
  const s = b.toString()
  process.stdout.write(s)
  if (s.includes('localhost:4173')) ready = true
})

const stop = () => {
  if (!preview.killed) preview.kill('SIGTERM')
}
process.on('exit', stop)
process.on('SIGINT', () => { stop(); process.exit(130) })

// Wait for "Local:   http://localhost:4173/" line
const deadline = Date.now() + 10_000
while (!ready && Date.now() < deadline) await wait(100)
if (!ready) {
  console.error('preview server did not start in time')
  stop()
  process.exit(1)
}

console.log('\n• Running browser bench …')
const env = {
  ...process.env,
  REDACT_URL: process.env.REDACT_URL ?? 'http://localhost:4173/',
}
const r = spawnSync('node', ['scripts/browser-bench.mjs'], {
  cwd,
  stdio: 'inherit',
  env,
})

stop()
process.exit(r.status ?? 0)

// Regenerate the measured report after the browser and Node runners finish.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { quantile } from '../benchmarks/stats.mjs'

const directory = resolve('benchmarks/results')
const files = process.argv.slice(2).length ? process.argv.slice(2).map(path => resolve(path)) : [
  resolve(directory, 'react-comparison-cpu1.json'),
  resolve(directory, 'react-comparison-cpu4.json'),
  resolve(directory, 'node-ssr-comparison.json'),
]
if (process.argv.slice(2).length && files.some(path => !existsSync(path))) throw new Error('An explicitly requested measurement file is missing')
const reports = files.filter(existsSync).map(path => {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  if (!data.complete) throw new Error(`Refusing to report incomplete run: ${path}`)
  return { path, data }
})
if (!reports.length) throw new Error('No completed measurement files found')
const number = (n, digits = 3) => n == null ? 'unavailable' : n.toFixed(digits)
const percent = n => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
const comparison = c => c ? `${percent(c.pairedTimeChangePercent)}${c.blockBootstrap95CI ? ` [${c.blockBootstrap95CI.map(percent).join(', ')}]` : ' [no CI]'}` : 'n/a'
const relative = path => './results/' + path.split('/').at(-1)
const lines = [
  '# React and Redact performance measurements', '',
  'Negative time changes mean less completed-work time. These are workload-specific results, not a whole-app speedup or a compatibility guarantee. [Method and reproduction](./README.md).', '',
]
for (const { path, data } of reports) {
  const node = !data.environment.browser
  const label = node ? 'Node SSR' : `Chrome, CPU slowdown ${data.environment.cpuRate}x, ${Object.keys(data.throughput).length} workloads`
  lines.push(`## ${label}`, '',
    `${data.environment.date.slice(0, 10)}; ${data.environment.cpu}; ${node ? data.environment.node : 'Chrome ' + data.environment.browser}; ${data.environment.blocks} independent ${node ? 'process' : 'browser'} blocks, ${data.environment.rounds} timed rounds per workload per block. [Raw results](${relative(path)}).`, '')
  const names = [...data.variants.map(v => v.name).filter(n => n !== 'react-control' && n !== 'current'), 'current']
  lines.push(`| Workload | ${names.join(' ms/iteration | ')} ms/iteration | Current vs React, 95% interval |`,
    `|---|${names.map(() => '---:|').join('')}---|`)
  for (const [name, work] of Object.entries(data.throughput)) {
    lines.push(`| ${name} | ${names.map(v => number(work.summary[v].median)).join(' | ')} | ${comparison(work.comparisons.react.current)} |`)
  }
  lines.push('', 'An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.', '')
  const controls = Object.entries(data.throughput).filter(([, w]) => w.comparisons.react['react-control'])
  if (controls.length) {
    if (data.variants.find(v => v.name === 'react').bundleSHA256 !== data.variants.find(v => v.name === 'react-control').bundleSHA256) throw new Error('React control bundle differs')
    const worst = [...controls].sort((a, b) => Math.abs(b[1].comparisons.react['react-control'].pairedTimeChangePercent) - Math.abs(a[1].comparisons.react['react-control'].pairedTimeChangePercent))[0]
    const medianNoise = quantile(controls.map(([, w]) => Math.abs(w.comparisons.react['react-control'].pairedTimeChangePercent)), 0.5)
    lines.push(`Identical-React control: median absolute time difference across workloads ${number(medianNoise, 1)}%; largest difference ${comparison(worst[1].comparisons.react['react-control'])} on ${worst[0]}. Small differences need repeat confirmation.`, '')
    const wide = controls.filter(([, w]) => w.comparisons.react['react-control'].blockBootstrap95CI?.some(n => Math.abs(n) > 5))
    if (wide.length) lines.push(`Control intervals extending beyond 5%: ${wide.map(([name, w]) => `${name} ${comparison(w.comparisons.react['react-control'])}`).join('; ')}. These expose run-to-run sensitivity even when the pooled control estimate is small.`, '')
  }
  const baselines = names.filter(name => name !== 'react' && name !== 'current')
  if (baselines.length) {
    lines.push(`| Workload | ${baselines.map(name => `Current vs ${name}`).join(' | ')} |`, `|---|${baselines.map(() => '---:|').join('')}`)
    for (const [name, work] of Object.entries(data.throughput)) {
      lines.push(`| ${name} | ${baselines.map(baseline => comparison(work.comparisons[baseline]?.current)).join(' | ')} |`)
    }
    lines.push('')
  }
  const mount = data.throughput['mount-unmount']
  if (mount && names.every(name => mount.samples[name].flat().every(sample => sample.diagnostics?.renderedCount != null))) {
    lines.push('### Mount/unmount render counts', '',
      'Each cycle mounts once and removes the subtree once. An extra component render during removal is unwanted work, even when final DOM and effect counts match.', '',
      '| Renderer | Component renders per cycle, observed range |', '|---|---:|')
    for (const name of names) {
      const counts = mount.samples[name].flat().map(sample => sample.diagnostics.renderedCount / sample.iterations)
      lines.push(`| ${name} | ${Math.min(...counts)} to ${Math.max(...counts)} |`)
    }
    lines.push('')
  }
  if (data.interactions && Object.keys(data.interactions).length) {
    lines.push('### Normal-scheduling clicks', '',
      'Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.', '',
      '| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |',
      '|---|---|---:|---:|---:|---:|')
    for (const [scenario, dataForScenario] of Object.entries(data.interactions)) for (const name of names) {
      const summary = dataForScenario.summary[name]
      const raw = dataForScenario[name].flat()
      const tasks = raw.reduce((sum, sample) => sum + sample.longTasks.filter(t => t.startTime + t.duration >= sample.eventTimeStamp && t.startTime <= sample.nextFrameMs).length, 0)
      lines.push(`| ${scenario} | ${name} | ${number(summary.handlerToCommitMs.median)} / ${number(summary.handlerToCommitMs.p95)} | ${number(summary.observedClickDurationMs.median, 1)} / ${number(summary.observedClickDurationMs.p95, 1)} | ${summary.observedClickEntries} / ${summary.clickSamples} | ${tasks} |`)
    }
    lines.push('', 'The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.', '')
  }
  if (data.memory && Object.keys(data.memory).length) {
    lines.push('### Retained heap for 2,400 mounted rows', '',
      'Separate mount/unmount-only pages, forced GC, three cycles per block. Values exclude the loaded-fixture baseline. Unmounted residuals can include JIT caches, so they are not a leak diagnosis.', '',
      '| Renderer | Median mounted JS heap delta, KiB | Median last-unmount residual, KiB | Last-unmount DOM node delta |', '|---|---:|---:|---:|')
    for (const name of names) {
      const samples = data.memory[name]
      lines.push(`| ${name} | ${number(quantile(samples.flatMap(b => b.cycles.map(c => c.mountedDeltaBytes)), 0.5) / 1024, 1)} | ${number(quantile(samples.map(b => b.cycles.at(-1).unmountedDeltaBytes), 0.5) / 1024, 1)} | ${samples.map(b => b.cycles.at(-1).unmounted.nodes - b.baseline.nodes).join(', ')} |`)
    }
    lines.push('')
  }
}
lines.push('## Compatibility and scope', '',
  'Each current variant is the source snapshot identified by its raw input hashes, not necessarily the latest working tree. Redact retains synchronous scheduling and intentional concurrency downgrades. Missing behavior can make a renderer cheaper, so equal fixture output does not imply equal functionality.', '',
  'The [upstream audit](../docs/REACT_19_3_AUDIT.md) and [API support notes](../docs/REACT_19_3_SUPPORT.md) record current behavior and remaining gaps. Historical measurements retain their original API surface; consult the recorded source hashes rather than assuming every snapshot supports the latest additions.', '',
  'These measurements do not cover tanstack.com or tannerlinsley.com, network/loading time, streaming Suspense waterfalls, input arriving during other work, field INP, memory allocation rate, or actual mobile hardware. A throttled desktop CPU is only a sensitivity check.', '')
const output = resolve(process.env.REPORT_OUTPUT || 'benchmarks/RESULTS.md')
writeFileSync(output, lines.join('\n'))
console.log('Wrote ' + output)

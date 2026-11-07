import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function pagesScenarios(job) {
  return ['pages-router', ...(job.deployment === 'static-export' ? [] : ['pages-data', 'server-runtime']), 'pages-hydration', ...(job.mode === 'development' ? ['pages-fast-refresh'] : []), ...(job.deployment === 'static-export' ? ['pages-static-props'] : [])]
}
export function pagesMatrix() {
  const jobs = []
  for (const deployment of ['node', 'standalone', 'static-export', 'workers']) for (const reference of [true, false]) {
    for (const mode of ['node', 'workers'].includes(deployment) ? ['development', 'production'] : ['production']) {
      jobs.push({ name: `${reference ? 'react' : 'redact'}-${mode}-${deployment}`, router: 'pages-only', deployment, reference, mode, basePath: ['standalone', 'static-export'].includes(deployment) ? '/coverage' : '' })
    }
  }
  return jobs
}
export async function collectVinextPagesCoverage(directory, expectedVersion = process.env.VINEXT_TEST_VERSION || '1.3.0') {
  const rows = [], issues = [], fingerprints = { sourceSha256: new Set(), buildSha256: new Set(), suiteSha256: new Set(), fixtureSha256: new Set() }
  for (const job of pagesMatrix()) {
    let artifact
    try { artifact = JSON.parse(await readFile(join(directory, job.name + '.json'), 'utf8')) }
    catch { issues.push(`${job.name}: missing result file`) }
    const results = Array.isArray(artifact?.results) ? artifact.results : []
    if (artifact) {
      if (!Array.isArray(artifact.results)) issues.push(`${job.name}: missing results array`)
      if (artifact.framework !== 'vinext' || artifact.version !== expectedVersion) issues.push(`${job.name}: unexpected framework version`)
      if (artifact.evidence?.installation !== 'npm-tarball') issues.push(`${job.name}: expected a fresh npm consumer`)
      for (const [field, values] of Object.entries(fingerprints)) {
        const value = artifact.evidence?.[field]
        if (/^[a-f0-9]{64}$/.test(value || '')) values.add(value)
        else issues.push(`${job.name}: missing ${field}`)
      }
    }
    for (const result of results) if (!['chromium', 'firefox', 'webkit'].includes(result.browser)) issues.push(`${job.name}: unexpected browser ${result.browser}`)
    for (const browser of ['chromium', 'firefox', 'webkit']) {
      const matches = results.filter(result => result.browser === browser), result = matches[0]
      if (matches.length > 1) issues.push(`${job.name}: duplicate ${browser}`)
      if (result) for (const field of ['router', 'deployment', 'reference', 'mode', 'basePath']) if (result[field] !== job[field]) issues.push(`${job.name}: incorrect ${field} for ${browser}`)
      const expected = pagesScenarios(job), scenarios = Array.isArray(result?.scenarios) ? result.scenarios : [], names = scenarios.map(s => s.name)
      const missing = expected.filter(name => !names.includes(name))
      const unexpected = names.filter((name, i) => !expected.includes(name) || names.indexOf(name) !== i)
      if (unexpected.length) issues.push(`${job.name}: unexpected or duplicate ${browser} scenarios: ${unexpected.join(', ')}`)
      const complete = !!result?.browserVersion && !missing.length && !unexpected.length
      const passed = complete && result.passed === true && !result.error && !artifact.error && scenarios.every(s => s.passed === true)
      rows.push({ ...job, browser, complete, passed, scenarios, missing, expected: expected.length, ...(result?.error || artifact?.error ? { error: result?.error || artifact.error } : {}) })
    }
  }
  for (const [field, values] of Object.entries(fingerprints)) if (values.size !== 1) issues.push(`Expected one ${field}, found ${values.size}`)
  const complete = !issues.length && rows.every(row => row.complete)
  return {
    recordedAt: new Date().toISOString(), framework: 'vinext', version: expectedVersion, router: 'pages-only', complete, passed: complete && rows.every(row => row.passed), issues,
    fingerprints: Object.fromEntries(Object.entries(fingerprints).map(([field, values]) => [field, [...values]])),
    summary: { expectedConfigurations: rows.length, completeConfigurations: rows.filter(r => r.complete).length, passedConfigurations: rows.filter(r => r.passed).length, expectedScenarios: rows.reduce((n, r) => n + r.expected, 0), passedScenarios: rows.reduce((n, r) => n + r.scenarios.filter(s => s.passed).length, 0), missingScenarios: rows.reduce((n, r) => n + r.missing.length, 0) }, rows,
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2] || process.env.VINEXT_TEST_PAGES_RESULTS || 'benchmarks/results/vinext-pages')
  const report = await collectVinextPagesCoverage(directory)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'coverage.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ ...report.summary, complete: report.complete, passed: report.passed, issues: report.issues }))
  if (!report.passed) process.exitCode = 1
}

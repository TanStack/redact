import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { vinextMatrix, vinextScenarios } from './vinext-matrix.mjs'

const engines = ['chromium', 'firefox', 'webkit']
const differences = {
  'transition-retains-visible-content': { pending: 'false', retained: false, fallback: true },
  'deferred-search-retains-stale-results': { query: 'beta', stale: 'false', retained: false, fallback: true },
}
const key = row => [row.deployment, row.mode, row.rendering, row.browser, row.basePath].join('|')

/**
 * Validates App Router matrix artifacts and native React controls for the
 * expected Vinext version.
 */
export async function collectVinextCoverage(directory, jobs = vinextMatrix(), expectedVersion = process.env.VINEXT_TEST_VERSION || '1.3.0') {
  const rows = [], issues = [], sourceHashes = new Set(), buildHashes = new Set(), suiteHashes = new Set()
  for (const job of jobs) {
    const file = `${job.name}.json`
    let artifact
    try { artifact = JSON.parse(await readFile(join(directory, file), 'utf8')) }
    catch { issues.push(`Missing or unreadable result: ${file}`) }
    const results = Array.isArray(artifact?.results) ? artifact.results : []
    if (artifact) {
      if (!Array.isArray(artifact.results)) issues.push(`${file}: missing results array`)
      if (artifact.evidence?.installation !== 'npm-tarball') issues.push(`${file}: expected an unpatched npm consumer`)
      if (!/^[a-f0-9]{64}$/.test(artifact.evidence?.fixtureSha256 || '')) issues.push(`${file}: missing fixtureSha256`)
      for (const [field, hashes] of [['sourceSha256', sourceHashes], ['buildSha256', buildHashes], ['suiteSha256', suiteHashes]]) {
        const hash = artifact.evidence?.[field]
        if (/^[a-f0-9]{64}$/.test(hash || '')) hashes.add(hash)
        else issues.push(`${file}: missing ${field}`)
      }
      if (artifact.framework !== 'vinext' || artifact.version !== expectedVersion) issues.push(`${file}: unexpected framework version`)
      if (artifact.passed && (!artifact.complete || results.some(row => !row.passed))) issues.push(`${file}: incorrectly marked passed`)
    }
    for (const result of results) if (!engines.includes(result.browser)) issues.push(`${file}: unexpected browser ${result.browser}`)
    for (const browser of engines) {
      const expected = vinextScenarios(job)
      const matches = results.filter(row => row.browser === browser)
      if (matches.length > 1) issues.push(`${file}: duplicate ${browser} result`)
      const result = matches[0]
      if (result) for (const field of ['deployment', 'mode', 'rendering', 'reference', 'basePath']) {
        if (result[field] !== job[field]) issues.push(`${file}: incorrect ${field} for ${browser}`)
      }
      const scenarios = Array.isArray(result?.scenarios) ? result.scenarios : []
      const names = scenarios.map(scenario => scenario.name)
      const missing = expected.filter(name => !names.includes(name))
      const unexpected = names.filter((name, index) => !expected.includes(name) || names.indexOf(name) !== index)
      if (unexpected.length) issues.push(`${file}: unexpected or duplicate ${browser} scenarios: ${unexpected.join(', ')}`)
      if (result?.passed && (missing.length || unexpected.length || scenarios.some(scenario => !scenario.passed))) issues.push(`${file}: incorrectly marked ${browser} passed`)
      const complete = !!artifact?.complete && !!result?.browserVersion && !missing.length && !unexpected.length
      rows.push({ ...job, browser, file, complete, attempted: !!result || !!artifact?.error, passed: complete && result.passed === true && !result.error && !artifact.error && scenarios.every(scenario => scenario.passed === true && !scenario.error && !scenario.browserErrors?.length), scenarios, missing, expected: expected.length, ...(result?.error || artifact?.error ? { error: result?.error || artifact.error } : {}) })
    }
  }
  for (const [label, hashes] of [['source', sourceHashes], ['build', buildHashes], ['suite', suiteHashes]]) if (hashes.size !== 1) issues.push(`Expected one ${label} fingerprint, found ${hashes.size}`)
  const controls = new Map(rows.filter(row => row.reference).map(row => [key(row), row]))
  const failures = []
  for (const row of rows) {
    if (!row.complete) failures.push({ configuration: row.name, browser: row.browser, file: row.file, kind: row.error ? 'setup-or-run-failure' : 'missing-coverage', missing: row.missing, ...(row.error ? { error: row.error } : {}) })
    for (const scenario of row.scenarios.filter(scenario => !scenario.passed)) {
      const control = controls.get(key(row))?.scenarios.find(candidate => candidate.name === scenario.name)
      const knownDifference = !row.reference && control?.passed && Object.hasOwn(differences, scenario.name) && !scenario.browserErrors?.length && isDeepStrictEqual(scenario.actual, differences[scenario.name])
      const kind = knownDifference ? 'concurrency-difference' : row.reference ? 'native-react-failure' : control && !control.passed ? 'also-fails-with-native-react' : 'redact-failure'
      failures.push({ configuration: row.name, browser: row.browser, file: row.file, kind, scenario: scenario.name, ...(scenario.actual !== undefined ? { actual: scenario.actual, expected: scenario.expected } : {}), ...(scenario.error ? { error: scenario.error } : {}), ...(scenario.browserErrors?.length ? { browserErrors: scenario.browserErrors } : {}) })
    }
  }
  const summary = {
    expectedConfigurations: rows.length,
    attemptedConfigurations: rows.filter(row => row.attempted).length,
    completeConfigurations: rows.filter(row => row.complete).length,
    passedConfigurations: rows.filter(row => row.passed).length,
    expectedScenarios: rows.reduce((count, row) => count + row.expected, 0),
    executedScenarios: rows.reduce((count, row) => count + row.scenarios.length, 0),
    passedScenarios: rows.reduce((count, row) => count + row.scenarios.filter(scenario => scenario.passed).length, 0),
    failedScenarios: rows.reduce((count, row) => count + row.scenarios.filter(scenario => !scenario.passed).length, 0),
    missingScenarios: rows.reduce((count, row) => count + row.missing.length, 0),
    concurrencyDifferences: failures.filter(failure => failure.kind === 'concurrency-difference').length,
    nativeReactFailures: failures.filter(failure => failure.kind === 'native-react-failure').length,
    alsoFailsWithNativeReact: failures.filter(failure => failure.kind === 'also-fails-with-native-react').length,
    redactFailures: failures.filter(failure => failure.kind === 'redact-failure').length,
  }
  const complete = !issues.length && rows.every(row => row.complete)
  return { recordedAt: new Date().toISOString(), framework: 'vinext', version: expectedVersion, summary, complete, passed: complete && rows.every(row => row.passed), issues, fingerprints: { source: [...sourceHashes], build: [...buildHashes], suite: [...suiteHashes] }, rows, failures }
}

export function formatVinextCoverage(report) {
  const s = report.summary
  const lines = ['# Vinext compatibility results', '', `Vinext ${report.version}. Recorded ${report.recordedAt}.`, '', `${s.attemptedConfigurations}/${s.expectedConfigurations} configurations attempted, ${s.completeConfigurations} completed, ${s.passedConfigurations} passed all parity checks.`, '', `${s.passedScenarios}/${s.expectedScenarios} planned scenarios passed. ${s.failedScenarios} failed and ${s.missingScenarios} could not run.`, '', `Full coverage: ${report.complete ? 'yes' : 'no'}. Full parity: ${report.passed ? 'yes' : 'no'}.`, '', '| Deployment | Mode | Rendering | Native React checks | Redact checks |', '| --- | --- | --- | ---: | ---: |']
  const groups = new Map()
  for (const row of report.rows) {
    const name = [row.deployment, row.mode, row.rendering].join('|')
    if (!groups.has(name)) groups.set(name, { row, react: [0, 0], redact: [0, 0] })
    const group = groups.get(name)[row.reference ? 'react' : 'redact']
    group[0] += row.scenarios.filter(scenario => scenario.passed).length
    group[1] += row.expected
  }
  for (const { row, react, redact } of groups.values()) lines.push(`| ${row.deployment} | ${row.mode} | ${row.rendering} | ${react.join('/')} | ${redact.join('/')} |`)
  lines.push('', `Concurrency differences: ${s.concurrencyDifferences}. Native React scenario failures: ${s.nativeReactFailures}. Redact failures in the same scenario as native React: ${s.alsoFailsWithNativeReact}. Other Redact failures: ${s.redactFailures}.`, '', 'Failures remain failures in the raw results and in this report. Configuration, browser, individual assertions, fingerprints, and complete error output are in [coverage.json](./coverage.json).', '')
  if (report.issues.length) lines.push('Report validation issues:', '', ...report.issues.map(issue => `- ${issue}`), '')
  return lines.join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2] || 'benchmarks/results/vinext')
  const report = await collectVinextCoverage(directory)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'coverage.json'), JSON.stringify(report, null, 2) + '\n')
  await writeFile(join(directory, 'coverage.md'), formatVinextCoverage(report))
  console.log(JSON.stringify({ ...report.summary, complete: report.complete, passed: report.passed, issues: report.issues }))
  if (!report.passed) process.exitCode = 1
}

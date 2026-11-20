import { expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error The matrix is shared with native Node runners.
import { vinextMatrix, vinextScenarios } from '../scripts/vinext-matrix.mjs'
// @ts-expect-error The report is shared with native Node runners.
import { collectVinextCoverage } from '../scripts/report-vinext-coverage.mjs'

it('requires complete paired evidence and never converts known differences into passes', async () => {
  const expectedVersion = '1.3.0'
  const directory = await mkdtemp(join(tmpdir(), 'vinext-report-'))
  const jobs = vinextMatrix(['node']).filter((job: any) => job.mode === 'production' && job.rendering === 'standard')
  try {
    for (const job of jobs) await writeFile(join(directory, job.name + '.json'), JSON.stringify({
      framework: 'vinext', version: '1.3.0', complete: true, passed: true,
      evidence: { installation: 'npm-tarball', sourceSha256: 'a'.repeat(64), buildSha256: 'b'.repeat(64), suiteSha256: 'c'.repeat(64), fixtureSha256: 'd'.repeat(64) },
      results: ['chromium', 'firefox', 'webkit'].map(browser => ({ ...job, browser, browserVersion: 'test', passed: true, scenarios: vinextScenarios(job).map((name: string) => ({ name, passed: true })) })),
    }))
    const clean = await collectVinextCoverage(directory, jobs, expectedVersion)
    expect(clean.passed).toBe(true)
    expect(clean.version).toBe('1.3.0')
    expect(clean.summary).toMatchObject({ expectedConfigurations: 6, completeConfigurations: 6, passedConfigurations: 6, missingScenarios: 0 })
    const path = join(directory, jobs.find((job: any) => !job.reference).name + '.json')
    const original = await readFile(path, 'utf8')
    for (const corrupt of [
      (value: any) => { value.evidence.installation = 'workspace' },
      (value: any) => { value.evidence.installation = 'modified-consumer' },
      (value: any) => { value.error = 'setup failed' },
      (value: any) => { value.results[0].error = 'browser failed' },
      (value: any) => { value.results[0].scenarios[0].browserErrors = ['unexpected error'] },
      (value: any) => { value.results.push({ ...value.results[0], browser: 'unknown' }) },
    ]) {
      const artifact = JSON.parse(original)
      corrupt(artifact)
      await writeFile(path, JSON.stringify(artifact))
      expect((await collectVinextCoverage(directory, jobs, expectedVersion)).passed).toBe(false)
    }
    await writeFile(path, original)
    const result = JSON.parse(original)
    result.passed = result.results[0].passed = false
    const transition = result.results[0].scenarios.find((scenario: any) => scenario.name === 'transition-retains-visible-content')
    transition.passed = false
    transition.actual = { pending: 'false', retained: false, fallback: true }
    await writeFile(path, JSON.stringify(result))
    const difference = await collectVinextCoverage(directory, jobs, expectedVersion)
    expect(difference.complete).toBe(true)
    expect(difference.passed).toBe(false)
    expect(difference.summary).toMatchObject({ concurrencyDifferences: 1, passedConfigurations: 5, failedScenarios: 1 })

    // An unrelated failure without an `actual` payload is still a new failure.
    const hydration = result.results[0].scenarios.find((scenario: any) => scenario.name === 'hydration')
    hydration.passed = false
    await writeFile(path, JSON.stringify(result))
    expect((await collectVinextCoverage(directory, jobs, expectedVersion)).summary.redactFailures).toBe(1)

    result.evidence.buildSha256 = 'e'.repeat(64)
    result.results.pop()
    await writeFile(path, JSON.stringify(result))
    const partial = await collectVinextCoverage(directory, jobs, expectedVersion)
    expect(partial.complete).toBe(false)
    expect(partial.passed).toBe(false)
    expect(partial.summary.missingScenarios).toBe(vinextScenarios(jobs[0]).length)
    expect(partial.issues.some((issue: string) => issue.includes('build fingerprint'))).toBe(true)

    result.results = {}
    await writeFile(path, JSON.stringify(result))
    const malformed = await collectVinextCoverage(directory, jobs, expectedVersion)
    expect(malformed.complete).toBe(false)
    expect(malformed.summary.missingScenarios).toBe(vinextScenarios(jobs[0]).length * 3)
    expect(malformed.issues.some((issue: string) => issue.includes('missing results array'))).toBe(true)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('rejects results from an unexpected vinext version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vinext-report-version-'))
  const jobs = vinextMatrix(['node']).filter((job: any) => job.mode === 'production' && job.rendering === 'standard').slice(0, 1)
  try {
    for (const job of jobs) await writeFile(join(directory, job.name + '.json'), JSON.stringify({
      framework: 'vinext', version: '1.4.3', complete: true, passed: true,
      evidence: { installation: 'npm-tarball', sourceSha256: 'a'.repeat(64), buildSha256: 'b'.repeat(64), suiteSha256: 'c'.repeat(64), fixtureSha256: 'd'.repeat(64) },
      results: ['chromium', 'firefox', 'webkit'].map(browser => ({ ...job, browser, browserVersion: 'test', passed: true, scenarios: vinextScenarios(job).map((name: string) => ({ name, passed: true })) })),
    }))
    expect((await collectVinextCoverage(directory, jobs, '1.4.3')).passed).toBe(true)
    expect((await collectVinextCoverage(directory, jobs, '1.3.0')).passed).toBe(false)
    expect((await collectVinextCoverage(directory, jobs, '1.3.0')).issues.some((issue: string) => issue.includes('unexpected framework version'))).toBe(true)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

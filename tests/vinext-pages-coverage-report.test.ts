import { expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error The report is shared with native Node runners.
import { collectVinextPagesCoverage, pagesMatrix, pagesScenarios } from '../scripts/report-vinext-pages-coverage.mjs'

it('requires all Pages-only browsers and scenarios from one unpatched consumer', async () => {
  const expectedVersion = '1.3.0'
  const directory = await mkdtemp(join(tmpdir(), 'vinext-pages-report-'))
  try {
    for (const job of pagesMatrix()) await writeFile(join(directory, job.name + '.json'), JSON.stringify({
      framework: 'vinext', version: '1.3.0',
      evidence: { installation: 'npm-tarball', sourceSha256: 'a'.repeat(64), buildSha256: 'b'.repeat(64), suiteSha256: 'c'.repeat(64), fixtureSha256: 'd'.repeat(64) },
      results: ['chromium', 'firefox', 'webkit'].map(browser => ({ ...job, browser, browserVersion: 'test', passed: true, scenarios: pagesScenarios(job).map((name: string) => ({ name, passed: true })) })),
    }))
    expect(await collectVinextPagesCoverage(directory, expectedVersion)).toMatchObject({ complete: true, passed: true, summary: { expectedConfigurations: 36, passedConfigurations: 36, expectedScenarios: 150, passedScenarios: 150 } })
    const file = join(directory, 'redact-development-workers.json'), original = await readFile(file, 'utf8')
    for (const corrupt of [
      (value: any) => { value.results[2].browser = 'firefox' },
      (value: any) => { value.results[0].scenarios[1] = value.results[0].scenarios[0] },
      (value: any) => { value.results[0].scenarios[0].passed = false },
      (value: any) => { value.results[0].error = 'unexpected browser error' },
      (value: any) => { value.evidence.buildSha256 = 'e'.repeat(64) },
      (value: any) => { value.evidence.installation = 'workspace' },
      (value: any) => { delete value.evidence.suiteSha256 },
      (value: any) => { value.results = {} },
    ]) {
      const artifact = JSON.parse(original)
      corrupt(artifact)
      await writeFile(file, JSON.stringify(artifact))
      expect((await collectVinextPagesCoverage(directory, expectedVersion)).passed).toBe(false)
    }
    await rm(file)
    expect(await collectVinextPagesCoverage(directory, expectedVersion)).toMatchObject({ complete: false, passed: false })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('rejects Pages results from an unexpected vinext version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vinext-pages-report-version-'))
  const jobs = pagesMatrix()
  try {
    for (const job of jobs) await writeFile(join(directory, job.name + '.json'), JSON.stringify({
      framework: 'vinext', version: '1.4.3',
      evidence: { installation: 'npm-tarball', sourceSha256: 'a'.repeat(64), buildSha256: 'b'.repeat(64), suiteSha256: 'c'.repeat(64), fixtureSha256: 'd'.repeat(64) },
      results: ['chromium', 'firefox', 'webkit'].map(browser => ({ ...job, browser, browserVersion: 'test', passed: true, scenarios: pagesScenarios(job).map((name: string) => ({ name, passed: true })) })),
    }))
    expect((await collectVinextPagesCoverage(directory, '1.4.3')).passed).toBe(true)
    expect((await collectVinextPagesCoverage(directory, '1.3.0')).passed).toBe(false)
    expect((await collectVinextPagesCoverage(directory, '1.3.0')).issues.some((issue: string) => issue.includes('unexpected framework version'))).toBe(true)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

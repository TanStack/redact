// @vitest-environment node
import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error The browser matrix is an untyped Node script.
import { nextVersions, nextScenarios, nextRenderings } from '../scripts/next-versions.mjs'

it('requires every matrix cell and scenario, consistent builds, and honest failure status', () => {
  const directory = mkdtempSync(join(tmpdir(), 'redact-coverage-report-'))
  const results: any[] = []
  for (const version of nextVersions) for (const bundler of ['turbopack', 'webpack']) {
    for (const deployment of ['node', ...(version === nextVersions[0] || version === nextVersions.at(-1) ? ['standalone', 'static-export'] : [])]) for (const rendering of deployment === 'static-export' ? ['standard'] : nextRenderings(version)) {
      for (const mode of deployment === 'node' ? ['development', 'production'] : ['production']) {
        for (const browser of ['chromium', 'firefox', 'webkit']) results.push({ version, bundler, mode, deployment, rendering, browser, passed: true, scenarios: nextScenarios(version, mode, deployment, rendering).map((name: string) => ({ name, passed: true })) })
      }
    }
  }
  const run = (records: any[]) => {
    for (let index = 0; index < records.length; index++) writeFileSync(join(directory, `run-${index}.json`), JSON.stringify(records[index]))
    let passed = true
    try { execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/report-next-coverage.mjs', import.meta.url)), directory], { stdio: 'pipe' }) }
    catch { passed = false }
    const report = JSON.parse(readFileSync(join(directory, 'coverage.json'), 'utf8'))
    for (let index = 0; index < records.length; index++) rmSync(join(directory, `run-${index}.json`))
    return { passed, report }
  }
  const record = () => ({ complete: true, evidence: { packageSha256: 'package', suiteSha256: 'suite' }, results: structuredClone(results) })
  try {
    expect(results).toHaveLength(162)
    expect(results.flatMap(result => result.scenarios)).toHaveLength(2844)
    expect(run([record()])).toMatchObject({ passed: true, report: { complete: true, passed: true, matrix: { executed: 162 } } })
    const missing = record(); missing.results.pop()
    expect(run([missing])).toMatchObject({ passed: false, report: { complete: false } })
    const omitted = record(); omitted.results[0].scenarios.pop()
    expect(run([omitted])).toMatchObject({ passed: false, report: { complete: false } })
    const standard = record(); standard.results = standard.results.filter((result: any) => result.rendering !== 'standard' || result.version === '15.5.28' || result.deployment === 'static-export')
    expect(run([standard])).toMatchObject({ passed: false, report: { complete: false } })
    const duplicate = record(); duplicate.results.push(duplicate.results[0])
    expect(run([duplicate])).toMatchObject({ passed: false, report: { complete: false } })
    for (const field of ['packageSha256', 'suiteSha256'] as const) {
      const first = record(), second = record()
      second.evidence[field] = 'different'
      second.results = first.results.splice(48)
      expect(run([first, second])).toMatchObject({ passed: false, report: { complete: false } })
    }
    const failed = record(); failed.results[0].passed = false; failed.results[0].scenarios[0].passed = false
    expect(run([failed])).toMatchObject({ passed: false, report: { complete: true, passed: false } })
    failed.results[0].passed = true
    expect(run([failed])).toMatchObject({ passed: false, report: { complete: false, passed: false } })
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

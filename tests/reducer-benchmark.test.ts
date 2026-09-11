import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reducerWorkloads } from '../benchmarks/reducer-workloads'

let originalBody: Node[]
beforeEach(() => { originalBody = Array.from(document.body.childNodes) })
afterEach(() => {
  vi.restoreAllMocks()
  expect(Array.from(document.body.childNodes)).toEqual(originalBody)
})

for (const iterations of [0, 1, 5]) {
  it.each(reducerWorkloads)(`$name verifies every completed commit with ${iterations} iterations`, async workload => {
    const retry = workload.name === 'reducer-suspense-retries'
    const cycles = retry ? iterations : 0
    const result = await workload.execute(iterations)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.operations).toBe(iterations * 96 * (retry ? 2 : 3))
    expect(result.checks).toBe(10)
    expect(result.diagnostics).toEqual({
      layoutCommits: 96 * (iterations + 1),
      layoutCleanups: 96 * iterations,
      minRowCommits: iterations + 1,
      maxRowCommits: iterations + 1,
      layoutDomChecks: 96 * (iterations + 1),
      fallbackMounts: cycles,
      fallbackUnmounts: cycles,
      hiddenChecks: cycles * 2,
      independentSuspensions: Math.min(cycles, 1),
      firstRowValue: iterations === 0 ? 0 : retry ? iterations === 1 ? 8 : 3160 : iterations === 1 ? 7 : 32767,
      lastRowValue: iterations === 0 ? 95 : retry ? iterations === 1 ? 388 : 100440 : iterations === 1 ? 767 : 145718,
    })
  })
}

it.each(reducerWorkloads)('$name completes its full default-length sequence', async workload => {
  const iterations = workload.defaultIterations
  const cycles = workload.name === 'reducer-suspense-retries' ? iterations : 0
  const result = await workload.execute(iterations)
  expect(result.checks).toBe(10)
  expect(result.diagnostics).toMatchObject({
    layoutCommits: 96 * (iterations + 1),
    minRowCommits: iterations + 1,
    maxRowCommits: iterations + 1,
    layoutDomChecks: 96 * (iterations + 1),
    fallbackMounts: cycles,
    fallbackUnmounts: cycles,
    hiddenChecks: cycles * 2,
    independentSuspensions: Math.min(cycles, 1),
  })
})

it('rejects incorrect intermediate DOM even when the final DOM is correct', async () => {
  const getText = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!.get!
  let sawCorrectFinalDom = false
  vi.spyOn(Node.prototype, 'textContent', 'get').mockImplementation(function (this: Node) {
    const value = getText.call(this)
    if (this instanceof HTMLElement && this.dataset.reducerRow === '0') {
      if (value === '0:7') return '0:incorrect'
      if (value === '0:63') sawCorrectFinalDom = true
    }
    return value
  })
  await expect(reducerWorkloads[0]!.execute(2)).rejects.toThrow('layout callback must see its committed DOM')
  expect(sawCorrectFinalDom).toBe(true)
})

it('rejects a primary that is not hidden during an independently triggered suspension', async () => {
  const getText = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!.get!
  vi.spyOn(Node.prototype, 'textContent', 'get').mockImplementation(function (this: Node) {
    const value = getText.call(this)
    if (this instanceof HTMLElement && this.hasAttribute('data-reducer-fallback')) {
      const primary = this.parentElement?.querySelector<HTMLElement>('[data-reducer-primary]')
      if (primary) primary.style.display = ''
    }
    return value
  })
  await expect(reducerWorkloads[2]!.execute(1)).rejects.toThrow('primary must be hidden during every pending attempt')
})

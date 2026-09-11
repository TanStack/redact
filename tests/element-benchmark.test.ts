import { expect, it } from 'vitest'
import { elementWorkloads } from '../benchmarks/element-workloads'

it.each(elementWorkloads)('validates completed $name factory work', async workload => {
  const sample = await workload.execute(3)
  expect(sample.operations).toBe(768)
  expect(sample.checks).toBe(257)
  expect(sample.diagnostics.checksum).toBe(98688)
})

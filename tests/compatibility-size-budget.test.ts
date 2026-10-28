import { expect, it } from 'vitest'
import { compatibilitySizeAllowance } from '../scripts/compatibility-size-budget.mjs'

const base = '89f2bfc58135fdf5fcb29af4c346680e0eda2763'
const nano = { profile: 'nano', entry: 'client-total', target: 'react19' }
it('limits the approved comparison to its exact base and metric', () => {
  expect(compatibilitySizeAllowance(base, nano, 'brotli')).toBe(47)
  expect(compatibilitySizeAllowance(base, nano, 'gzip')).toBe(0)
  expect(compatibilitySizeAllowance(base, nano, 'min')).toBe(0)
  expect(compatibilitySizeAllowance(base, nano, 'constructor')).toBe(0)
  expect(compatibilitySizeAllowance(base, nano, 'toString')).toBe(0)
  expect(compatibilitySizeAllowance('another-base', nano, 'brotli')).toBe(0)
  expect(compatibilitySizeAllowance(undefined, nano, 'brotli')).toBe(0)
})
it('keeps unapproved profiles and targets at zero growth', () => {
  expect(compatibilitySizeAllowance(base, { ...nano, profile: 'default' }, 'brotli')).toBe(0)
  expect(compatibilitySizeAllowance(base, { ...nano, target: 'react18' }, 'brotli')).toBe(11)
  expect(compatibilitySizeAllowance(base, { ...nano, entry: 'react/index' }, 'brotli')).toBe(0)
})

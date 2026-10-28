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

it('bounds the SSR correctness allowance to its measured base, entry and metric', () => {
  const base = '0c7274e17a3fade8396169bc6ed024903cd1252d'
  const server = { profile: 'full', entry: 'server/index', target: 'react19' }
  expect(compatibilitySizeAllowance(base, server, 'min')).toBe(1199)
  expect(compatibilitySizeAllowance(base, server, 'gzip')).toBe(486)
  expect(compatibilitySizeAllowance(base, server, 'brotli')).toBe(430)
  expect(compatibilitySizeAllowance(base, server, 'constructor')).toBe(0)
  expect(compatibilitySizeAllowance(base, { ...server, entry: 'react/index' }, 'gzip')).toBe(0)
  expect(compatibilitySizeAllowance('another-base', server, 'gzip')).toBe(0)
})

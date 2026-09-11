import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quantile, summarize, compareBlocks, random, shuffle } from './stats.mjs'

test('quantiles interpolate and empty samples stay unavailable', () => {
  assert.equal(quantile([4, 1, 3, 2], 0.5), 2.5)
  assert.equal(summarize([]).median, null)
})
test('paired block comparison uses direction and never fabricates a one-block CI', () => {
  assert.equal(compareBlocks([[5]], [[10]]).pairedTimeChangePercent, -50)
  assert.equal(compareBlocks([[5]], [[10]]).blockBootstrap95CI, null)
  const result = compareBlocks([[5, 10], [10, 15], [15, 20]], [[10, 20], [20, 30], [30, 40]])
  assert.deepEqual(result.blockBootstrap95CI, [-50, -50])
  assert.throws(() => compareBlocks([[0]], [[10]]))
  assert.throws(() => compareBlocks([[5, 10]], [[10]]))
})
test('seeded order is reproducible and preserves every renderer', () => {
  const input = ['react', 'published', 'current']
  assert.deepEqual(shuffle(input, random(42)), shuffle(input, random(42)))
  assert.deepEqual(shuffle(input, random(42)).sort(), [...input].sort())
})

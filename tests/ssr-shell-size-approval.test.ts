import { expect, test } from 'vitest'
import { shellReleaseAllowance } from '../scripts/compatibility-size-budget.mjs'
const base = '2a76bd9dfdb72e53357c49e5b87d3f64e3fab6b5'
const hash = '2b37faa65dd412be2166c19506c01b0a2801aff32b6f16dd43515243b001348d'
test('shell release approval cannot apply to other sources or client rows', () => {
  for (const profile of ['full', 'default', 'nano']) for (const target of ['react18', 'react19']) {
    const row = {profile, target, entry: 'server/index'}
    for (const [metric, bytes] of Object.entries({min: 11, gzip: 4, brotli: 18})) {
      expect(shellReleaseAllowance(base, row, metric, hash)).toBe(bytes)
      expect(shellReleaseAllowance('other', row, metric, hash)).toBe(0)
      expect(shellReleaseAllowance(base, row, metric, 'changed')).toBe(0)
      expect(shellReleaseAllowance(base, {...row, entry: 'dom/client'}, metric, hash)).toBe(0)
    }
    expect(shellReleaseAllowance(base, {...row, profile: 'other'}, 'gzip', hash)).toBe(0)
    expect(shellReleaseAllowance(base, {...row, target: 'other'}, 'gzip', hash)).toBe(0)
  }
})

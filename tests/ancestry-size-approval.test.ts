import { expect, test } from 'vitest'
import { ancestryAllowance, ancestryFingerprint } from '../scripts/compatibility-size-budget.mjs'
const base = 'a2e7e1297af8696bad0ce6d1daf76c92c9590aff'
const hash = '84511e7b93f795520eb9c1773e54244f11ee73058cb45346104d95a91a083581'
const rows = [
  {
    "profile": "full",
    "entry": "react/index",
    "target": "react19",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "full",
    "entry": "react/index",
    "target": "react18",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "full",
    "entry": "react/jsx-runtime",
    "target": "react19",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "full",
    "entry": "react/jsx-runtime",
    "target": "react18",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "full",
    "entry": "dom/index",
    "target": "react19",
    "min": 4,
    "gzip": 0,
    "brotli": -30
  },
  {
    "profile": "full",
    "entry": "dom/index",
    "target": "react18",
    "min": 4,
    "gzip": 0,
    "brotli": -22
  },
  {
    "profile": "full",
    "entry": "dom/client",
    "target": "react19",
    "min": 4,
    "gzip": 1,
    "brotli": 19
  },
  {
    "profile": "full",
    "entry": "dom/client",
    "target": "react18",
    "min": 4,
    "gzip": 2,
    "brotli": 13
  },
  {
    "profile": "full",
    "entry": "server/index",
    "target": "react19",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "full",
    "entry": "server/index",
    "target": "react18",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "full",
    "entry": "client-total",
    "target": "react19",
    "min": 4,
    "gzip": 0,
    "brotli": -50
  },
  {
    "profile": "full",
    "entry": "client-total",
    "target": "react18",
    "min": 4,
    "gzip": 0,
    "brotli": 63
  },
  {
    "profile": "default",
    "entry": "react/index",
    "target": "react19",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "default",
    "entry": "react/index",
    "target": "react18",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "default",
    "entry": "react/jsx-runtime",
    "target": "react19",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "default",
    "entry": "react/jsx-runtime",
    "target": "react18",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "default",
    "entry": "dom/index",
    "target": "react19",
    "min": 4,
    "gzip": 0,
    "brotli": -6
  },
  {
    "profile": "default",
    "entry": "dom/index",
    "target": "react18",
    "min": 4,
    "gzip": 1,
    "brotli": 23
  },
  {
    "profile": "default",
    "entry": "dom/client",
    "target": "react19",
    "min": 4,
    "gzip": 0,
    "brotli": 1
  },
  {
    "profile": "default",
    "entry": "dom/client",
    "target": "react18",
    "min": 4,
    "gzip": 1,
    "brotli": 21
  },
  {
    "profile": "default",
    "entry": "server/index",
    "target": "react19",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "default",
    "entry": "server/index",
    "target": "react18",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "default",
    "entry": "client-total",
    "target": "react19",
    "min": 4,
    "gzip": 0,
    "brotli": -43
  },
  {
    "profile": "default",
    "entry": "client-total",
    "target": "react18",
    "min": 4,
    "gzip": 1,
    "brotli": -42
  },
  {
    "profile": "nano",
    "entry": "react/index",
    "target": "react19",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "nano",
    "entry": "react/index",
    "target": "react18",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "nano",
    "entry": "react/jsx-runtime",
    "target": "react19",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "nano",
    "entry": "react/jsx-runtime",
    "target": "react18",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "nano",
    "entry": "dom/index",
    "target": "react19",
    "min": 2,
    "gzip": 1,
    "brotli": -4
  },
  {
    "profile": "nano",
    "entry": "dom/index",
    "target": "react18",
    "min": 2,
    "gzip": 0,
    "brotli": 39
  },
  {
    "profile": "nano",
    "entry": "dom/client",
    "target": "react19",
    "min": 2,
    "gzip": 1,
    "brotli": -5
  },
  {
    "profile": "nano",
    "entry": "dom/client",
    "target": "react18",
    "min": 2,
    "gzip": 1,
    "brotli": -4
  },
  {
    "profile": "nano",
    "entry": "server/index",
    "target": "react19",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "nano",
    "entry": "server/index",
    "target": "react18",
    "min": 0,
    "gzip": 0,
    "brotli": 0
  },
  {
    "profile": "nano",
    "entry": "client-total",
    "target": "react19",
    "min": 2,
    "gzip": 2,
    "brotli": -17
  },
  {
    "profile": "nano",
    "entry": "client-total",
    "target": "react18",
    "min": 2,
    "gzip": 1,
    "brotli": 16
  }
]
test('ancestry approval is limited to exact rows, source and base', () => {
 expect(ancestryFingerprint()).toBe(hash)
 for (const row of rows) for (const metric of ['min', 'gzip', 'brotli'] as const) {
  expect(ancestryAllowance(base, row, metric, hash)).toBe(row[metric])
  expect(ancestryAllowance('other', row, metric, hash)).toBe(0)
  expect(ancestryAllowance(base, row, metric, 'changed')).toBe(0)
  for (const field of ['profile', 'entry', 'target']) expect(ancestryAllowance(base, {...row, [field]: 'other'}, metric, hash)).toBe(0)
 }
 expect(ancestryAllowance(base, rows[0]!, 'unknown', hash)).toBe(0)
})

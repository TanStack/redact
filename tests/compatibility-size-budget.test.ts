// @vitest-environment node
import { expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compatibilitySizeAllowance, hydrationSplitAllowance, hydrationSplitFingerprint, queuedStoreAllowance, queuedStoreFingerprint } from '../scripts/compatibility-size-budget.mjs'

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

it('limits the inline metadata allowance to the approved 16-byte Brotli comparison', () => {
  const base = '0c7274e17a3fade8396169bc6ed024903cd1252d'
  const row = { profile: 'full', entry: 'client-total', target: 'react19' }
  expect(compatibilitySizeAllowance(base, row, 'brotli')).toBe(16)
  expect(compatibilitySizeAllowance(base, row, 'gzip')).toBe(0)
  expect(compatibilitySizeAllowance(base, row, 'min')).toBe(0)
  expect(compatibilitySizeAllowance(base, { ...row, target: 'react18' }, 'brotli')).toBe(0)
  expect(compatibilitySizeAllowance(base, { ...row, profile: 'default' }, 'brotli')).toBe(0)
  expect(compatibilitySizeAllowance('another-base', row, 'brotli')).toBe(0)
})

const approvedFingerprint = 'acc5edd9e6e466a55b875a06a0e19e1afc7ccb091bac461e638009ff0d1f2712'
const hydrationBase = '82da568053c186552325a12fdd48a1fb32e27dc1'
const hydrationRows: Array<{profile:string;entry:string;target:string;allowance:Record<string,number>}> = [
  {
    "profile": "full",
    "entry": "dom/client",
    "target": "react19",
    "allowance": {
      "brotli": 82
    }
  },
  {
    "profile": "full",
    "entry": "dom/client",
    "target": "react18",
    "allowance": {
      "brotli": 4
    }
  },
  {
    "profile": "full",
    "entry": "client-total",
    "target": "react19",
    "allowance": {
      "gzip": 1
    }
  },
  {
    "profile": "full",
    "entry": "client-total",
    "target": "react18",
    "allowance": {
      "brotli": 42
    }
  },
  {
    "profile": "default",
    "entry": "dom/client",
    "target": "react19",
    "allowance": {
      "brotli": 26
    }
  },
  {
    "profile": "default",
    "entry": "dom/client",
    "target": "react18",
    "allowance": {
      "brotli": 27
    }
  },
  {
    "profile": "default",
    "entry": "client-total",
    "target": "react19",
    "allowance": {
      "gzip": 1
    }
  },
  {
    "profile": "default",
    "entry": "client-total",
    "target": "react18",
    "allowance": {
      "gzip": 2,
      "brotli": 20
    }
  }
]
it.each(hydrationRows)('limits the hydration split allowance to $profile $entry $target', ({profile,entry,target,allowance}) => {
  const row={profile,entry,target}
  for(const metric of ['min','gzip','brotli'])
    expect(hydrationSplitAllowance(hydrationBase,row,metric,approvedFingerprint)).toBe(allowance[metric] ?? 0)
  expect(hydrationSplitAllowance('another-base',row,'brotli',approvedFingerprint)).toBe(0)
  expect(hydrationSplitAllowance(hydrationBase,{...row,profile:'nano'},'brotli',approvedFingerprint)).toBe(0)
  expect(hydrationSplitAllowance(hydrationBase,row,'constructor',approvedFingerprint)).toBe(0)
})
it('rejects a missing or changed approval fingerprint', () => {
  const row = {profile: 'full', entry: 'dom/client', target: 'react19'}
  expect(hydrationSplitAllowance(hydrationBase, row, 'brotli', undefined)).toBe(0)
  expect(hydrationSplitAllowance(hydrationBase, row, 'brotli', 'changed')).toBe(0)
})

it.each([
  'packages/redact/src/runtime.ts',
  'scripts/test-react-compatibility-size.mjs',
  'packages/redact/package.json',
  '.changeset/strip-streamed-hydration.md',
])('expires the fingerprint when %s changes or disappears', changedFile => {
  const root = mkdtempSync(resolve(tmpdir(), 'redact-hydration-allowance-'))
  const files = ['packages/redact/src/runtime.ts', 'packages/redact/package.json',
    'scripts/build.mjs', 'scripts/measure-size.mjs', 'scripts/test-react-compatibility-size.mjs',
    'pnpm-lock.yaml', '.nvmrc', '.changeset/strip-streamed-hydration.md']
  try {
    for (const file of files) {
      const destination = resolve(root, file)
      mkdirSync(dirname(destination), {recursive: true})
      writeFileSync(destination, file + '\n')
    }
    const url = pathToFileURL(root + '/')
    const original = hydrationSplitFingerprint(url)
    expect(original).toBe('795d9e3a09349fd995e89558419fa9a088a634524f28aa2cbcfb643c92f6a5eb')
    appendFileSync(resolve(root, changedFile), 'changed\n')
    expect(hydrationSplitFingerprint(url)).not.toBe(original)
    rmSync(resolve(root, changedFile))
    if (changedFile === 'packages/redact/src/runtime.ts') {
      expect(hydrationSplitFingerprint(url)).not.toBe(original)
    } else {
      expect(hydrationSplitFingerprint(url)).toBeUndefined()
    }
    // The production entry point must read its actual checkout, with no way for
    // a caller to supply the historical approved fingerprint.
    const row = {profile: 'full', entry: 'dom/client', target: 'react19'}
    expect(compatibilitySizeAllowance(hydrationBase, row, 'brotli')).toBe(
      hydrationSplitAllowance(hydrationBase, row, 'brotli', hydrationSplitFingerprint()),
    )
  } finally { rmSync(root, {recursive: true, force: true}) }
})

it('limits the approved queuedStore comparison to exact inputs and rows', () => {
  const base = '70d534b44f9baa50628cd41373b5f66d634d714f'
  const fingerprint = '0915db720712aa37f9d437acadf759f36b3e1b709c83c638e2ba677f86cf4c5b'
  expect(queuedStoreFingerprint()).toBe(fingerprint)
  const rows = [{"profile": "full", "entry": "react/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "react/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "react/jsx-runtime", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "react/jsx-runtime", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "dom/index", "target": "react19", "min": 494, "gzip": 179, "brotli": 101}, {"profile": "full", "entry": "dom/index", "target": "react18", "min": 494, "gzip": 181, "brotli": 145}, {"profile": "full", "entry": "dom/client", "target": "react19", "min": 489, "gzip": 155, "brotli": 56}, {"profile": "full", "entry": "dom/client", "target": "react18", "min": 489, "gzip": 156, "brotli": 115}, {"profile": "full", "entry": "server/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "server/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "client-total", "target": "react19", "min": 489, "gzip": 177, "brotli": 147}, {"profile": "full", "entry": "client-total", "target": "react18", "min": 489, "gzip": 173, "brotli": 126}, {"profile": "default", "entry": "react/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "react/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "react/jsx-runtime", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "react/jsx-runtime", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "dom/index", "target": "react19", "min": 494, "gzip": 164, "brotli": 135}, {"profile": "default", "entry": "dom/index", "target": "react18", "min": 494, "gzip": 157, "brotli": 176}, {"profile": "default", "entry": "dom/client", "target": "react19", "min": 490, "gzip": 150, "brotli": 102}, {"profile": "default", "entry": "dom/client", "target": "react18", "min": 490, "gzip": 148, "brotli": 71}, {"profile": "default", "entry": "server/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "server/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "client-total", "target": "react19", "min": 488, "gzip": 147, "brotli": 102}, {"profile": "default", "entry": "client-total", "target": "react18", "min": 488, "gzip": 145, "brotli": 105}, {"profile": "nano", "entry": "react/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "react/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "react/jsx-runtime", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "react/jsx-runtime", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "dom/index", "target": "react19", "min": 328, "gzip": 122, "brotli": 149}, {"profile": "nano", "entry": "dom/index", "target": "react18", "min": 328, "gzip": 122, "brotli": 171}, {"profile": "nano", "entry": "dom/client", "target": "react19", "min": 327, "gzip": 124, "brotli": 127}, {"profile": "nano", "entry": "dom/client", "target": "react18", "min": 327, "gzip": 125, "brotli": 127}, {"profile": "nano", "entry": "server/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "server/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "client-total", "target": "react19", "min": 329, "gzip": 127, "brotli": 69}, {"profile": "nano", "entry": "client-total", "target": "react18", "min": 329, "gzip": 132, "brotli": 112}]
  for (const row of rows) {
    for (const metric of ['min','gzip','brotli'] as const) {
      expect(queuedStoreAllowance(base,row,metric,fingerprint)).toBe(Math.max(0,row[metric]))
      expect(queuedStoreAllowance('other',row,metric,fingerprint)).toBe(0)
      expect(queuedStoreAllowance(base,row,metric,'changed')).toBe(0)
      expect(queuedStoreAllowance(base,row,metric,undefined)).toBe(0)
    }
    expect(queuedStoreAllowance(base,row,'constructor',fingerprint)).toBe(0)
  }
})

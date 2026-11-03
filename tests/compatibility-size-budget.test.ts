// @vitest-environment node
import { expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compatibilitySizeAllowance, hydrationSplitAllowance, hydrationSplitFingerprint, recoveryAllowance, recoveryFingerprint, autofocusAllowance } from '../scripts/compatibility-size-budget.mjs'

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

it('preserves the measured SSR and inline metadata allowances', () => {
  const base = '0c7274e17a3fade8396169bc6ed024903cd1252d'
  const row = { profile: 'full', entry: 'client-total', target: 'react19' }
  expect(compatibilitySizeAllowance(base, row, 'brotli')).toBe(20)
  expect(compatibilitySizeAllowance(base, row, 'gzip')).toBe(16)
  expect(compatibilitySizeAllowance(base, row, 'min')).toBe(51)
  expect(compatibilitySizeAllowance(base, { ...row, target: 'react18' }, 'brotli')).toBe(32)
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

const recoveryRows = [{"profile": "full", "entry": "react/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "react/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "react/jsx-runtime", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "react/jsx-runtime", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "dom/index", "target": "react19", "min": 30, "gzip": 59, "brotli": 34}, {"profile": "full", "entry": "dom/index", "target": "react18", "min": 30, "gzip": 61, "brotli": -1}, {"profile": "full", "entry": "dom/client", "target": "react19", "min": 37, "gzip": 67, "brotli": -20}, {"profile": "full", "entry": "dom/client", "target": "react18", "min": 37, "gzip": 68, "brotli": 99}, {"profile": "full", "entry": "server/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "server/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "client-total", "target": "react19", "min": 36, "gzip": 80, "brotli": 41}, {"profile": "full", "entry": "client-total", "target": "react18", "min": 36, "gzip": 66, "brotli": 39}, {"profile": "default", "entry": "react/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "react/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "react/jsx-runtime", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "react/jsx-runtime", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "dom/index", "target": "react19", "min": 23, "gzip": 51, "brotli": 32}, {"profile": "default", "entry": "dom/index", "target": "react18", "min": 23, "gzip": 52, "brotli": 53}, {"profile": "default", "entry": "dom/client", "target": "react19", "min": 28, "gzip": 76, "brotli": 43}, {"profile": "default", "entry": "dom/client", "target": "react18", "min": 28, "gzip": 74, "brotli": 15}, {"profile": "default", "entry": "server/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "server/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "client-total", "target": "react19", "min": 26, "gzip": 66, "brotli": 61}, {"profile": "default", "entry": "client-total", "target": "react18", "min": 26, "gzip": 58, "brotli": 74}, {"profile": "nano", "entry": "react/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "react/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "react/jsx-runtime", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "react/jsx-runtime", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "dom/index", "target": "react19", "min": 150, "gzip": 52, "brotli": 56}, {"profile": "nano", "entry": "dom/index", "target": "react18", "min": 150, "gzip": 54, "brotli": 61}, {"profile": "nano", "entry": "dom/client", "target": "react19", "min": 150, "gzip": 56, "brotli": 55}, {"profile": "nano", "entry": "dom/client", "target": "react18", "min": 150, "gzip": 57, "brotli": 55}, {"profile": "nano", "entry": "server/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "server/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "client-total", "target": "react19", "min": 150, "gzip": 56, "brotli": 46}, {"profile": "nano", "entry": "client-total", "target": "react18", "min": 150, "gzip": 59, "brotli": 57}]

it('enforces the exact historical recovery rows and fingerprint scope', () => {
  const base = '70d534b44f9baa50628cd41373b5f66d634d714f'
  const fingerprint = '5452053436021e318f5b7245c6fc19b00441a9ea0a5092da251eb8a561339e73'
  for (const row of recoveryRows) {
    for (const metric of ['min', 'gzip', 'brotli'] as const) {
      expect(recoveryAllowance(base, row, metric, fingerprint)).toBe(Math.max(0, row[metric]))
      expect(recoveryAllowance('other', row, metric, fingerprint)).toBe(0)
      expect(recoveryAllowance(base, row, metric, 'changed')).toBe(0)
      expect(recoveryAllowance(base, row, metric, undefined)).toBe(0)
    }
    expect(recoveryAllowance(base, row, 'constructor', fingerprint)).toBe(0)
  }
  expect(recoveryAllowance(base, {profile:'unknown',entry:'unknown',target:'unknown'}, 'gzip', fingerprint)).toBe(0)
})

it('expires recovery approval for changed runtime, build, toolchain or release inputs', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'redact-recovery-allowance-'))
  const files = ['packages/redact/src/runtime.ts', 'packages/redact/package.json',
    'scripts/build.mjs', 'scripts/measure-size.mjs', 'scripts/test-react-compatibility-size.mjs',
    'pnpm-lock.yaml', '.nvmrc', '.changeset/error-boundary-recovery.md']
  try {
    for (const file of files) {
      mkdirSync(dirname(resolve(root, file)), {recursive: true})
      writeFileSync(resolve(root, file), file + '\n')
    }
    const url = pathToFileURL(root + '/')
    const original = recoveryFingerprint(url)
    expect(typeof original).toBe('string')
    for (const file of files) {
      appendFileSync(resolve(root, file), 'changed\n')
      expect(recoveryFingerprint(url)).not.toBe(original)
      writeFileSync(resolve(root, file), file + '\n')
      expect(recoveryFingerprint(url)).toBe(original)
    }
    rmSync(resolve(root, '.changeset/error-boundary-recovery.md'))
    expect(recoveryFingerprint(url)).toBeUndefined()
  } finally { rmSync(root, {recursive: true, force: true}) }
})

it('limits the approved autofocus comparison to exact inputs and rows', () => {
  const base = '577e3769002c467639878efe2218b2d16cc8aff6'
  const fingerprint = '0c0c8746d0b2e9a6066003ef3a7baf7fe1c3e14bed4ad7ee5b8dd1d514970776'
  const rows = [{"profile": "full", "entry": "react/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "react/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "react/jsx-runtime", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "react/jsx-runtime", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "dom/index", "target": "react19", "min": 104, "gzip": 52, "brotli": 80}, {"profile": "full", "entry": "dom/index", "target": "react18", "min": 104, "gzip": 55, "brotli": 51}, {"profile": "full", "entry": "dom/client", "target": "react19", "min": 106, "gzip": 47, "brotli": 43}, {"profile": "full", "entry": "dom/client", "target": "react18", "min": 106, "gzip": 48, "brotli": 70}, {"profile": "full", "entry": "server/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "server/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "full", "entry": "client-total", "target": "react19", "min": 104, "gzip": 57, "brotli": 62}, {"profile": "full", "entry": "client-total", "target": "react18", "min": 104, "gzip": 54, "brotli": 58}, {"profile": "default", "entry": "react/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "react/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "react/jsx-runtime", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "react/jsx-runtime", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "dom/index", "target": "react19", "min": 104, "gzip": 52, "brotli": 37}, {"profile": "default", "entry": "dom/index", "target": "react18", "min": 104, "gzip": 44, "brotli": 53}, {"profile": "default", "entry": "dom/client", "target": "react19", "min": 104, "gzip": 52, "brotli": 60}, {"profile": "default", "entry": "dom/client", "target": "react18", "min": 104, "gzip": 50, "brotli": 45}, {"profile": "default", "entry": "server/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "server/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "default", "entry": "client-total", "target": "react19", "min": 104, "gzip": 52, "brotli": 90}, {"profile": "default", "entry": "client-total", "target": "react18", "min": 104, "gzip": 49, "brotli": 73}, {"profile": "nano", "entry": "react/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "react/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "react/jsx-runtime", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "react/jsx-runtime", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "dom/index", "target": "react19", "min": 135, "gzip": 36, "brotli": 41}, {"profile": "nano", "entry": "dom/index", "target": "react18", "min": 135, "gzip": 37, "brotli": 46}, {"profile": "nano", "entry": "dom/client", "target": "react19", "min": 135, "gzip": 60, "brotli": 49}, {"profile": "nano", "entry": "dom/client", "target": "react18", "min": 135, "gzip": 60, "brotli": 57}, {"profile": "nano", "entry": "server/index", "target": "react19", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "server/index", "target": "react18", "min": 0, "gzip": 0, "brotli": 0}, {"profile": "nano", "entry": "client-total", "target": "react19", "min": 135, "gzip": 54, "brotli": 25}, {"profile": "nano", "entry": "client-total", "target": "react18", "min": 135, "gzip": 48, "brotli": 58}]
  for (const row of rows) {
    for (const metric of ['min','gzip','brotli'] as const) {
      expect(autofocusAllowance(base,row,metric,fingerprint)).toBe(Math.max(0,row[metric]))
      expect(autofocusAllowance('other',row,metric,fingerprint)).toBe(0)
      expect(autofocusAllowance(base,row,metric,'changed')).toBe(0)
      expect(autofocusAllowance(base,row,metric,undefined)).toBe(0)
    }
    expect(autofocusAllowance(base,row,'constructor',fingerprint)).toBe(0)
  }
})

it('bounds the SSR correctness allowance to its measured base, entry and metric', () => {
  const base = '0c7274e17a3fade8396169bc6ed024903cd1252d'
  const server = { profile: 'full', entry: 'server/index', target: 'react19' }
  expect(compatibilitySizeAllowance(base, server, 'min')).toBe(323)
  expect(compatibilitySizeAllowance(base, server, 'gzip')).toBe(109)
  expect(compatibilitySizeAllowance(base, server, 'brotli')).toBe(112)
  expect(compatibilitySizeAllowance(base, server, 'constructor')).toBe(0)
  expect(compatibilitySizeAllowance(base, { ...server, entry: 'react/index' }, 'gzip')).toBe(0)
  expect(compatibilitySizeAllowance('another-base', server, 'gzip')).toBe(0)
})

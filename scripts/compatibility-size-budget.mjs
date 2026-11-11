import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'

// Measured store/hydration correctness costs approved against this exact base.
// Other bases, entries and metrics retain the zero-growth requirement.
const approvedBase = '89f2bfc58135fdf5fcb29af4c346680e0eda2763'
const allowances = {
  "full:dom/client:react19": {
    "brotli": 12
  },
  "full:server/index:react19": {
    "gzip": 6
  },
  "full:server/index:react18": {
    "gzip": 6,
    "brotli": 11
  },
  "default:server/index:react19": {
    "gzip": 6
  },
  "default:server/index:react18": {
    "gzip": 6,
    "brotli": 11
  },
  "nano:dom/index:react19": {
    "brotli": 9
  },
  "nano:server/index:react19": {
    "gzip": 6
  },
  "nano:server/index:react18": {
    "gzip": 6,
    "brotli": 11
  },
  "nano:client-total:react19": {
    "brotli": 47
  },
  "nano:client-total:react18": {
    "gzip": 1,
    "brotli": 11
  }
}

// Approved 2026-11-01 for the streamed-hydration split only. Pin both the
// comparison base and all build/runtime inputs so another patch cannot reuse it.
// The second base only adds the independent SSR change from #123; the affected
// client inputs and approved row limits are identical.
const hydrationSplitBases = {
  "37c051c92cb2cda0f5b609aa29745c164e258d72": "a59621ef86788ef6af20a7b687e7c2368ca4aecaae40c2ff9f7ef3ff21b98334",
  "82da568053c186552325a12fdd48a1fb32e27dc1": "acc5edd9e6e466a55b875a06a0e19e1afc7ccb091bac461e638009ff0d1f2712"
}
const hydrationSplitInputs = [
  "packages/redact/src",
  "packages/redact/package.json",
  "scripts/build.mjs",
  "scripts/measure-size.mjs",
  "scripts/test-react-compatibility-size.mjs",
  "pnpm-lock.yaml",
  ".nvmrc",
  ".changeset/strip-streamed-hydration.md"
]
const hydrationSplitAllowances = {
  "full:dom/client:react19": {
    "brotli": 82
  },
  "full:dom/client:react18": {
    "brotli": 4
  },
  "full:client-total:react19": {
    "gzip": 1
  },
  "full:client-total:react18": {
    "brotli": 42
  },
  "default:dom/client:react19": {
    "brotli": 26
  },
  "default:dom/client:react18": {
    "brotli": 27
  },
  "default:client-total:react19": {
    "gzip": 1
  },
  "default:client-total:react18": {
    "gzip": 2,
    "brotli": 20
  }
}
function fingerprintInputs(inputs, root) {
  try {
    const files = []
    function collect(file) {
      const url = new URL(file, root)
      if (statSync(url).isDirectory()) for (const name of readdirSync(url)) collect(file + '/' + name)
      else files.push(file)
    }
    for (const file of inputs) collect(file)
    const hashes = files.sort().map(file => [file,
      createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex')])
    return createHash('sha256').update(JSON.stringify(hashes)).digest('hex')
  } catch {
    return undefined
  }
}
export function hydrationSplitFingerprint(root = new URL('../', import.meta.url)) {
  return fingerprintInputs(hydrationSplitInputs, root)
}

// Pure approval lookup, kept separate from reading the current checkout so the
// historical approval remains testable after versioning consumes its Changeset.
export function hydrationSplitAllowance(base, row, metric, fingerprint) {
  const expected = hydrationSplitBases[base]
  if (typeof expected === 'string' && fingerprint === expected) {
    const value = hydrationSplitAllowances[`${row.profile}:${row.entry}:${row.target}`]?.[metric]
    return typeof value === 'number' ? value : 0
  }
  return 0
}

// Approved 2026-11-02 for PR109 recovery only. Pin the exact comparison
// base and runtime/build inputs; other patches, bases and rows get no allowance.
const recoveryApproval = {
  base: '70d534b44f9baa50628cd41373b5f66d634d714f',
  fingerprint: '5452053436021e318f5b7245c6fc19b00441a9ea0a5092da251eb8a561339e73',
  rows: {
  "full:dom/index:react19": {
    "min": 30,
    "gzip": 59,
    "brotli": 34
  },
  "full:dom/index:react18": {
    "min": 30,
    "gzip": 61
  },
  "full:dom/client:react19": {
    "min": 37,
    "gzip": 67
  },
  "full:dom/client:react18": {
    "min": 37,
    "gzip": 68,
    "brotli": 99
  },
  "full:client-total:react19": {
    "min": 36,
    "gzip": 80,
    "brotli": 41
  },
  "full:client-total:react18": {
    "min": 36,
    "gzip": 66,
    "brotli": 39
  },
  "default:dom/index:react19": {
    "min": 23,
    "gzip": 51,
    "brotli": 32
  },
  "default:dom/index:react18": {
    "min": 23,
    "gzip": 52,
    "brotli": 53
  },
  "default:dom/client:react19": {
    "min": 28,
    "gzip": 76,
    "brotli": 43
  },
  "default:dom/client:react18": {
    "min": 28,
    "gzip": 74,
    "brotli": 15
  },
  "default:client-total:react19": {
    "min": 26,
    "gzip": 66,
    "brotli": 61
  },
  "default:client-total:react18": {
    "min": 26,
    "gzip": 58,
    "brotli": 74
  },
  "nano:dom/index:react19": {
    "min": 150,
    "gzip": 52,
    "brotli": 56
  },
  "nano:dom/index:react18": {
    "min": 150,
    "gzip": 54,
    "brotli": 61
  },
  "nano:dom/client:react19": {
    "min": 150,
    "gzip": 56,
    "brotli": 55
  },
  "nano:dom/client:react18": {
    "min": 150,
    "gzip": 57,
    "brotli": 55
  },
  "nano:client-total:react19": {
    "min": 150,
    "gzip": 56,
    "brotli": 46
  },
  "nano:client-total:react18": {
    "min": 150,
    "gzip": 59,
    "brotli": 57
  }
}
}

const recoveryInputs = [
  'packages/redact/src',
  'packages/redact/package.json',
  'scripts/build.mjs',
  'scripts/measure-size.mjs',
  'scripts/test-react-compatibility-size.mjs',
  'pnpm-lock.yaml',
  '.nvmrc',
  '.changeset/error-boundary-recovery.md'
]
export function recoveryFingerprint(root = new URL('../', import.meta.url)) {
  return fingerprintInputs(recoveryInputs, root)
}
export function recoveryAllowance(base, row, metric, fingerprint) {
  if (base !== recoveryApproval.base || fingerprint !== recoveryApproval.fingerprint)
    return 0
  const value = recoveryApproval.rows[`${row.profile}:${row.entry}:${row.target}`]?.[metric]
  return typeof value === 'number' ? value : 0
}

// Approved 2026-11-02 for autofocus only. Pin the exact comparison
// base and runtime/build inputs; other patches, bases and rows get no allowance.
const autofocusApproval = {
  base: '577e3769002c467639878efe2218b2d16cc8aff6',
  fingerprint: '0c0c8746d0b2e9a6066003ef3a7baf7fe1c3e14bed4ad7ee5b8dd1d514970776',
  rows: {
  "full:dom/index:react19": {
    "min": 104,
    "gzip": 52,
    "brotli": 80
  },
  "full:dom/index:react18": {
    "min": 104,
    "gzip": 55,
    "brotli": 51
  },
  "full:dom/client:react19": {
    "min": 106,
    "gzip": 47,
    "brotli": 43
  },
  "full:dom/client:react18": {
    "min": 106,
    "gzip": 48,
    "brotli": 70
  },
  "full:client-total:react19": {
    "min": 104,
    "gzip": 57,
    "brotli": 62
  },
  "full:client-total:react18": {
    "min": 104,
    "gzip": 54,
    "brotli": 58
  },
  "default:dom/index:react19": {
    "min": 104,
    "gzip": 52,
    "brotli": 37
  },
  "default:dom/index:react18": {
    "min": 104,
    "gzip": 44,
    "brotli": 53
  },
  "default:dom/client:react19": {
    "min": 104,
    "gzip": 52,
    "brotli": 60
  },
  "default:dom/client:react18": {
    "min": 104,
    "gzip": 50,
    "brotli": 45
  },
  "default:client-total:react19": {
    "min": 104,
    "gzip": 52,
    "brotli": 90
  },
  "default:client-total:react18": {
    "min": 104,
    "gzip": 49,
    "brotli": 73
  },
  "nano:dom/index:react19": {
    "min": 135,
    "gzip": 36,
    "brotli": 41
  },
  "nano:dom/index:react18": {
    "min": 135,
    "gzip": 37,
    "brotli": 46
  },
  "nano:dom/client:react19": {
    "min": 135,
    "gzip": 60,
    "brotli": 49
  },
  "nano:dom/client:react18": {
    "min": 135,
    "gzip": 60,
    "brotli": 57
  },
  "nano:client-total:react19": {
    "min": 135,
    "gzip": 54,
    "brotli": 25
  },
  "nano:client-total:react18": {
    "min": 135,
    "gzip": 48,
    "brotli": 58
  }
}
}

const autofocusInputs = [
  'packages/redact/src',
  'packages/redact/package.json',
  'scripts/build.mjs',
  'scripts/measure-size.mjs',
  'scripts/test-react-compatibility-size.mjs',
  'pnpm-lock.yaml',
  '.nvmrc',
  '.changeset/late-mounted-autofocus.md'
]
export function autofocusFingerprint(root = new URL('../', import.meta.url)) {
  return fingerprintInputs(autofocusInputs, root)
}
export function autofocusAllowance(base, row, metric, fingerprint) {
  if (base !== autofocusApproval.base || fingerprint !== autofocusApproval.fingerprint)
    return 0
  const value = autofocusApproval.rows[`${row.profile}:${row.entry}:${row.target}`]?.[metric]
  return typeof value === 'number' ? value : 0
}

// Tanner approved this exact server-only shell-release cost on 2026-11-02.
const shellReleaseBase = '2a76bd9dfdb72e53357c49e5b87d3f64e3fab6b5'
const shellReleaseHash = '2b37faa65dd412be2166c19506c01b0a2801aff32b6f16dd43515243b001348d'
export function shellReleaseFingerprint(root = new URL('../', import.meta.url)) {
  return fingerprintInputs(['packages/redact/src', 'packages/redact/package.json', 'scripts/build.mjs', 'scripts/measure-size.mjs', 'scripts/test-react-compatibility-size.mjs', 'pnpm-lock.yaml', '.nvmrc', '.changeset/release-ssr-shell.md'], root)
}
export function shellReleaseAllowance(base, row, metric, fingerprint) {
  if (base !== shellReleaseBase || fingerprint !== shellReleaseHash || row.entry !== 'server/index' || !['full', 'default', 'nano'].includes(row.profile) || !['react18', 'react19'].includes(row.target)) return 0
  return ({min: 11, gzip: 4, brotli: 18})[metric] || 0
}

export function compatibilitySizeAllowance(base, row, metric) {
  const shell = shellReleaseAllowance(base, row, metric, base === shellReleaseBase ? shellReleaseFingerprint() : undefined)
  if (shell) return shell
  const autofocus = autofocusAllowance(base, row, metric, base === autofocusApproval.base ? autofocusFingerprint() : undefined)
  if (autofocus) return autofocus
  const recovery = recoveryAllowance(base, row, metric,
    base === recoveryApproval.base ? recoveryFingerprint() : undefined)
  if (recovery) return recovery
  const hydration = hydrationSplitAllowance(base, row, metric,
    typeof hydrationSplitBases[base] === 'string' ? hydrationSplitFingerprint() : undefined)
  if (hydration) return hydration
  // Approved inline-metadata hydration fix, measured against the 0.2.2 base.
  if (base === '0c7274e17a3fade8396169bc6ed024903cd1252d' &&
      row.profile === 'full' && row.entry === 'client-total' &&
      row.target === 'react19' && metric === 'brotli') return 16
  if (base !== approvedBase) return 0
  const value = allowances[`${row.profile}:${row.entry}:${row.target}`]?.[metric]
  return typeof value === 'number' ? value : 0
}

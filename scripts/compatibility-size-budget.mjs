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
  fingerprint: 'fea7c7e83c1c04dbb52dd2f36d9f0961aa13f7fd458fb68764a1e3cbd638fb38',
  rows: {
  "full:dom/index:react19": {
    "min": 184,
    "gzip": 88,
    "brotli": 55
  },
  "full:dom/index:react18": {
    "min": 184,
    "gzip": 90,
    "brotli": 30
  },
  "full:dom/client:react19": {
    "min": 190,
    "gzip": 97,
    "brotli": 65
  },
  "full:dom/client:react18": {
    "min": 190,
    "gzip": 98,
    "brotli": 139
  },
  "full:client-total:react19": {
    "min": 189,
    "gzip": 109,
    "brotli": 49
  },
  "full:client-total:react18": {
    "min": 189,
    "gzip": 93,
    "brotli": 85
  },
  "default:dom/index:react19": {
    "min": 178,
    "gzip": 75,
    "brotli": 49
  },
  "default:dom/index:react18": {
    "min": 178,
    "gzip": 68,
    "brotli": 58
  },
  "default:dom/client:react19": {
    "min": 186,
    "gzip": 96,
    "brotli": 75
  },
  "default:dom/client:react18": {
    "min": 186,
    "gzip": 95,
    "brotli": 54
  },
  "default:client-total:react19": {
    "min": 182,
    "gzip": 100,
    "brotli": 116
  },
  "default:client-total:react18": {
    "min": 182,
    "gzip": 93,
    "brotli": 87
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

export function compatibilitySizeAllowance(base, row, metric) {
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

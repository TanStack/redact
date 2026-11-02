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

// Approved 2026-11-02 for queuedStore only. Pin the exact comparison
// base and runtime/build inputs; other patches, bases and rows get no allowance.
const queuedStoreApproval = {
  base: '70d534b44f9baa50628cd41373b5f66d634d714f',
  fingerprint: '0915db720712aa37f9d437acadf759f36b3e1b709c83c638e2ba677f86cf4c5b',
  rows: {
  "full:dom/index:react19": {
    "min": 494,
    "gzip": 179,
    "brotli": 101
  },
  "full:dom/index:react18": {
    "min": 494,
    "gzip": 181,
    "brotli": 145
  },
  "full:dom/client:react19": {
    "min": 489,
    "gzip": 155,
    "brotli": 56
  },
  "full:dom/client:react18": {
    "min": 489,
    "gzip": 156,
    "brotli": 115
  },
  "full:client-total:react19": {
    "min": 489,
    "gzip": 177,
    "brotli": 147
  },
  "full:client-total:react18": {
    "min": 489,
    "gzip": 173,
    "brotli": 126
  },
  "default:dom/index:react19": {
    "min": 494,
    "gzip": 164,
    "brotli": 135
  },
  "default:dom/index:react18": {
    "min": 494,
    "gzip": 157,
    "brotli": 176
  },
  "default:dom/client:react19": {
    "min": 490,
    "gzip": 150,
    "brotli": 102
  },
  "default:dom/client:react18": {
    "min": 490,
    "gzip": 148,
    "brotli": 71
  },
  "default:client-total:react19": {
    "min": 488,
    "gzip": 147,
    "brotli": 102
  },
  "default:client-total:react18": {
    "min": 488,
    "gzip": 145,
    "brotli": 105
  },
  "nano:dom/index:react19": {
    "min": 328,
    "gzip": 122,
    "brotli": 149
  },
  "nano:dom/index:react18": {
    "min": 328,
    "gzip": 122,
    "brotli": 171
  },
  "nano:dom/client:react19": {
    "min": 327,
    "gzip": 124,
    "brotli": 127
  },
  "nano:dom/client:react18": {
    "min": 327,
    "gzip": 125,
    "brotli": 127
  },
  "nano:client-total:react19": {
    "min": 329,
    "gzip": 127,
    "brotli": 69
  },
  "nano:client-total:react18": {
    "min": 329,
    "gzip": 132,
    "brotli": 112
  }
}
}

const queuedStoreInputs = [
  'packages/redact/src',
  'packages/redact/package.json',
  'scripts/build.mjs',
  'scripts/measure-size.mjs',
  'scripts/test-react-compatibility-size.mjs',
  'pnpm-lock.yaml',
  '.nvmrc',
  '.changeset/queued-descendant-updates.md'
]
export function queuedStoreFingerprint(root = new URL('../', import.meta.url)) {
  return fingerprintInputs(queuedStoreInputs, root)
}
export function queuedStoreAllowance(base, row, metric, fingerprint) {
  if (base !== queuedStoreApproval.base || fingerprint !== queuedStoreApproval.fingerprint)
    return 0
  const value = queuedStoreApproval.rows[`${row.profile}:${row.entry}:${row.target}`]?.[metric]
  return typeof value === 'number' ? value : 0
}

export function compatibilitySizeAllowance(base, row, metric) {
  const approved = queuedStoreAllowance(base, row, metric, base === queuedStoreApproval.base ? queuedStoreFingerprint() : undefined)
  if (approved) return approved
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

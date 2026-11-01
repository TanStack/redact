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
function matchesHydrationSplit(base) {
  const expected = hydrationSplitBases[base]
  if (typeof expected !== 'string') return false
  try {
    const files = []
    function collect(file) {
      const url = new URL('../' + file, import.meta.url)
      if (statSync(url).isDirectory()) for (const name of readdirSync(url)) collect(file + '/' + name)
      else files.push(file)
    }
    for (const file of hydrationSplitInputs) collect(file)
    const inputs = files.sort().map(file => [file,
      createHash('sha256').update(readFileSync(new URL('../' + file, import.meta.url))).digest('hex')])
    return createHash('sha256').update(JSON.stringify(inputs)).digest('hex') === expected
  } catch {
    return false
  }
}

export function compatibilitySizeAllowance(base, row, metric) {
  if (matchesHydrationSplit(base)) {
    const value = hydrationSplitAllowances[`${row.profile}:${row.entry}:${row.target}`]?.[metric]
    return typeof value === 'number' ? value : 0
  }
  // Approved inline-metadata hydration fix, measured against the 0.2.2 base.
  if (base === '0c7274e17a3fade8396169bc6ed024903cd1252d' &&
      row.profile === 'full' && row.entry === 'client-total' &&
      row.target === 'react19' && metric === 'brotli') return 16
  if (base !== approvedBase) return 0
  const value = allowances[`${row.profile}:${row.entry}:${row.target}`]?.[metric]
  return typeof value === 'number' ? value : 0
}

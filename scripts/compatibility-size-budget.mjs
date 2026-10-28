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

// Measured SSR correctness costs against the exact PR base.
const ssrBase = '0c7274e17a3fade8396169bc6ed024903cd1252d'
const ssrAllowances = {
  "full:dom/client:react19": {
    "min": 51,
    "gzip": 12
  },
  "full:dom/client:react18": {
    "min": 51,
    "gzip": 12
  },
  "full:server/index:react19": {
    "min": 323,
    "gzip": 109,
    "brotli": 112
  },
  "full:server/index:react18": {
    "min": 323,
    "gzip": 110,
    "brotli": 99
  },
  "full:client-total:react19": {
    "min": 51,
    "gzip": 16,
    "brotli": 20
  },
  "full:client-total:react18": {
    "min": 51,
    "gzip": 17,
    "brotli": 32
  },
  "default:dom/client:react19": {
    "min": 51,
    "gzip": 10,
    "brotli": 12
  },
  "default:dom/client:react18": {
    "min": 51,
    "gzip": 14,
    "brotli": 36
  },
  "default:server/index:react19": {
    "min": 323,
    "gzip": 109,
    "brotli": 112
  },
  "default:server/index:react18": {
    "min": 323,
    "gzip": 110,
    "brotli": 99
  },
  "default:client-total:react19": {
    "min": 51,
    "gzip": 20
  },
  "default:client-total:react18": {
    "min": 51,
    "gzip": 19,
    "brotli": 36
  },
  "nano:server/index:react19": {
    "min": 323,
    "gzip": 109,
    "brotli": 112
  },
  "nano:server/index:react18": {
    "min": 323,
    "gzip": 110,
    "brotli": 99
  }
}

export function compatibilitySizeAllowance(base, row, metric) {
  if (base === ssrBase) {
    const value = ssrAllowances[`${row.profile}:${row.entry}:${row.target}`]?.[metric]
    return typeof value === 'number' ? value : 0
  }
  if (base !== approvedBase) return 0
  const value = allowances[`${row.profile}:${row.entry}:${row.target}`]?.[metric]
  return typeof value === 'number' ? value : 0
}

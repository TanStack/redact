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

export function compatibilitySizeAllowance(base, row, metric) {
  // Approved inline-metadata hydration fix, measured against the 0.2.2 base.
  if (base === '0c7274e17a3fade8396169bc6ed024903cd1252d' &&
      row.profile === 'full' && row.entry === 'client-total' &&
      row.target === 'react19' && metric === 'brotli') return 16
  if (base !== approvedBase) return 0
  const value = allowances[`${row.profile}:${row.entry}:${row.target}`]?.[metric]
  return typeof value === 'number' ? value : 0
}

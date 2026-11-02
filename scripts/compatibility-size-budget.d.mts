export declare function compatibilitySizeAllowance(
  base: string | undefined,
  row: { profile: string; entry: string; target: string },
  metric: string,
): number

export declare function hydrationSplitFingerprint(root?: URL): string | undefined

export declare function hydrationSplitAllowance(
  base: string | undefined,
  row: { profile: string; entry: string; target: string },
  metric: string,
  fingerprint: string | undefined,
): number

export declare function queuedStoreFingerprint(root?: URL): string | undefined
export declare function queuedStoreAllowance(base: string | undefined, row: {profile: string; entry: string; target: string}, metric: string, fingerprint: string | undefined): number

// Match Fizz's transport identifiers. Hook IDs and boundary comment numbers are
// separate namespaces; only the DOM transport IDs use this prefixed hex scheme.
export const boundaryId = (id: number, prefix = ''): string => prefix + 'B:' + id.toString(16)
export const segmentId = (id: number, prefix = ''): string => prefix + 'S:' + id.toString(16)
export const scriptId = (id: string): string => JSON.stringify(id).replace(/</g, '\\u003c')

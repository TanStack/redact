export const isFunction = (value: any): value is ((...args: any[]) => any) & Record<string, any> => (typeof value === 'function')

export const isReservedProp = (name: string): boolean => (name === 'children' || name === 'ref' || name === 'key')

export const isThenable = (x: any): x is Promise<any> => (x != null && isFunction(x.then))

export const isString = (value: any): value is string => typeof value === 'string'

export const isObject = (value: any): boolean => typeof value === 'object'

export const isTextContent = (value: unknown): value is string | number | bigint => typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'

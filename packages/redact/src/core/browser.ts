export const REACT_RECOVERABLE_TYPE = Symbol.for('react.recoverable')

export interface BrowserToken {
  readonly $$typeof: typeof REACT_RECOVERABLE_TYPE
  readonly _reason: string | (() => unknown) | undefined
}

export function browser(reason?: string | (() => unknown)): BrowserToken {
  return { $$typeof: REACT_RECOVERABLE_TYPE, _reason: reason }
}

export function isBrowserToken(value: any): value is BrowserToken {
  return value?.$$typeof === REACT_RECOVERABLE_TYPE
}

export function browserError(token: BrowserToken): Error {
  let cause: unknown = token._reason
  if (typeof cause === 'function') {
    try {
      cause = cause()
    } catch {
      cause = 'The reason for browser-only rendering could not be determined because its initializer threw.'
    }
  }
  const error = new Error('Browser-only rendering was requested by `browser()`.',
    token._reason === undefined ? undefined : { cause })
  Object.defineProperty(error, REACT_RECOVERABLE_TYPE, { value: true })
  return error
}

export function isBrowserError(error: any): error is Error {
  return error?.[REACT_RECOVERABLE_TYPE] === true
}

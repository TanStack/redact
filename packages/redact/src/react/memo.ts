export const REACT_MEMO_TYPE = Symbol.for('react.memo')
export const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref')
export const REACT_LAZY_TYPE = Symbol.for('react.lazy')

export function memo<P>(
  type: (props: P) => any,
  areEqual?: (prev: Readonly<P>, next: Readonly<P>) => boolean,
) {
  return { $$typeof: REACT_MEMO_TYPE, type, compare: areEqual ?? null }
}

export function forwardRef<R, P = {}>(
  render: (props: P, ref: { current: R | null } | ((r: R | null) => void) | null) => any,
) {
  return { $$typeof: REACT_FORWARD_REF_TYPE, render }
}

export function lazy<T extends { default: any }>(ctor: () => Promise<T>) {
  const payload = {
    status: -1 as -1 | 0 | 1 | 2,
    result: undefined as any,
  }
  return {
    $$typeof: REACT_LAZY_TYPE,
    _payload: payload,
    _init: (p: typeof payload): any => {
      if (p.status === 1) return p.result
      if (p.status === 2) throw p.result
      if (p.status === 0) throw p.result // pending promise
      const thenable = ctor().then(
        (mod) => {
          p.status = 1
          p.result = mod.default
        },
        (err) => {
          p.status = 2
          p.result = err
        },
      )
      p.status = 0
      p.result = thenable
      throw thenable
    },
  }
}

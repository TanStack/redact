import type { ReactElement, ReactNode, Ref } from '../core'

export const REACT_MEMO_TYPE = Symbol.for('react.memo')
export const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref')
export const REACT_LAZY_TYPE = Symbol.for('react.lazy')

// Component-shaped return type so JSX usage of memo/forwardRef/lazy results
// type-checks. The runtime value is a `$$typeof`-tagged record that the
// reconciler recognizes via type-matchers; the cast lets TypeScript treat
// it as a callable component at JSX sites without changing what the runtime
// actually does. `children` is included for the common
// `<Comp>...</Comp>` form even when the inner P doesn't list it.
export type ExoticComponent<P> = ((
  props: P & { children?: ReactNode; ref?: any; key?: any },
) => ReactElement | null) & {
  readonly $$typeof: symbol
}

export function memo<P>(
  type: (props: P) => any,
  areEqual?: (prev: Readonly<P>, next: Readonly<P>) => boolean,
): ExoticComponent<P> {
  return { $$typeof: REACT_MEMO_TYPE, type, compare: areEqual ?? null } as unknown as ExoticComponent<P>
}

export function forwardRef<R, P = {}>(
  render: (props: P, ref: { current: R | null } | ((r: R | null) => void) | null) => any,
): ExoticComponent<P & { ref?: Ref<R> }> {
  return { $$typeof: REACT_FORWARD_REF_TYPE, render } as unknown as ExoticComponent<P & { ref?: Ref<R> }>
}

export function lazy<T extends { default: any }>(ctor: () => Promise<T>): ExoticComponent<
  T['default'] extends (props: infer P) => any ? P : {}
> {
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
  } as unknown as ExoticComponent<T['default'] extends (props: infer P) => any ? P : {}>
}

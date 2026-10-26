// Referenced from the file that redact() generates when `features.forwardRef`
// is false. Without the feature, the render function never receives the ref,
// so every forwardRef() call is a type error. A plain `ref` prop still works.
export {}

declare module 'react' {
  interface ForwardRefRenderFunction<T, P = {}> {
    'Redact: forwardRef requires the `forwardRef` feature. Pass `ref` as a prop, or set `features.forwardRef: true` in redact().': never
  }
}

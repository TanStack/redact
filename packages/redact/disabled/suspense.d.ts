// Referenced from the file that redact() generates when `features.suspense` is
// false. Without the feature, <Suspense> never shows its fallback, so every
// <Suspense> is a type error.
export {}

declare module 'react' {
  interface SuspenseProps {
    'Redact: <Suspense> requires the `suspense` feature. Set `features.suspense: true` in redact().': never
  }
}

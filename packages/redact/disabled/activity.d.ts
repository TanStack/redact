// Referenced from the file that redact() generates when `features.activity` is
// false. Without the feature, hidden children unmount and lose state, so every
// <Activity> is a type error.
export {}

declare module 'react' {
  interface ActivityProps {
    'Redact: <Activity> requires the `activity` feature. Set `features.activity: true` in redact().': never
  }
}

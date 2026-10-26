// Referenced from the file that redact() generates when `features.context` is
// false. Without the feature, providers do not pass values down, so every
// <Context> and <Context.Provider> is a type error. Reading the default value
// with useContext or use still type-checks.
export {}

declare module 'react' {
  interface ProviderProps<T> {
    'Redact: context providers require the `context` feature. Set `features.context: true` in redact().': never
  }
}

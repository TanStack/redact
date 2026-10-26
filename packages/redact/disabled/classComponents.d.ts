// Referenced from the file that redact() generates when
// `features.classComponents` is false. Without the feature, class components
// keep the constructor, render, setState, and componentWillUnmount, but other
// lifecycles and error boundaries are ignored. Declaring one of those is a
// type error. A class that only uses render and setState still type-checks.
export {}

type Message = 'Redact: this class lifecycle requires the `classComponents` feature. Set `features.classComponents: true` in redact().'

// A function returning `never` still fits React's optional static lifecycles,
// so plain classes still satisfy ComponentType. A subclass static returns
// state, which is not `never`, so it fails. The type argument puts the message
// in the error text.
type StaticDisabled<M extends string> = ((...redactFeatureDisabled: Array<any>) => never) & { readonly [K in M]?: never }

declare module 'react' {
  // Interface merging adds these as extra overloads. A subclass method must
  // satisfy every overload, and its return value cannot be `Message`.
  interface ComponentLifecycle<P, S, SS = any> {
    componentDidMount?(redactFeatureDisabled: never): Message
    shouldComponentUpdate?(redactFeatureDisabled: never): Message
    componentDidCatch?(redactFeatureDisabled: never): Message
  }
  interface NewLifecycle<P, S, SS> {
    getSnapshotBeforeUpdate?(redactFeatureDisabled: never): Message
    componentDidUpdate?(redactFeatureDisabled: never): Message
  }
  namespace Component {
    let getDerivedStateFromProps: StaticDisabled<Message>
    let getDerivedStateFromError: StaticDisabled<Message>
  }
}

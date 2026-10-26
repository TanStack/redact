// Referenced from the file that redact() generates when
// `features.viewTransitions` is false. Without the feature, <ViewTransition>
// keeps state but does not animate, so this only marks addTransitionType() as
// deprecated in editors.
export {}

declare module 'react' {
  /**
   * @deprecated Redact: transition types do not animate while `features.viewTransitions` is off. Set `features.viewTransitions: true` in redact().
   */
  function addTransitionType(type: string): void
}

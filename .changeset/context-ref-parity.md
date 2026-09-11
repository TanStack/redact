---
'@tanstack/redact': patch
---

Support React 19's direct context provider syntax (`<Context value={value}>`) on the client and server, including hydration. `Context.Provider` is now the context itself, so switching between the two forms preserves component state.

Keep `ref` in the props returned by `createElement` and `cloneElement`, including refs passed through function components and render-prop triggers. Cloning with an undefined ref preserves the original ref.

Use explicit reserved-key checks when copying props. This also preserves own props named `constructor`, `toString`, or `hasOwnProperty`.

import type { ReactNode } from 'react'
import { ActivityDemo } from './features/activity'
import { ClassComponentsDemo } from './features/class-components'
import { ContextDemo } from './features/context'
import { ForwardRefDemo } from './features/forward-ref'
import { MemoDemo } from './features/memo'
import { PortalDemo } from './features/portal'
import { SuspenseDemo } from './features/suspense'
import { ViewTransitionsDemo } from './features/view-transitions'

function Feature({ name, runtime, children }: { name: string; runtime: string; children?: ReactNode }) {
  return (
    <section>
      <h2><code>{name}</code></h2>
      <p className="runtime">{runtime}</p>
      {children}
    </section>
  )
}

export function App() {
  return (
    <main>
      <h1>Redact feature types</h1>
      <p>
        Every optional feature is off in <code>vite.config.ts</code>. Run <code>pnpm typecheck</code> to see a type
        error everywhere this app uses a disabled feature. Each section below shows what the stub does at runtime.
      </p>
      <Feature name="context" runtime="Both providers pass `dark`, but each child reads the default `light`.">
        <ContextDemo />
      </Feature>
      <Feature name="suspense" runtime="Children render inline. The fallback is ignored.">
        <SuspenseDemo />
      </Feature>
      <Feature name="activity" runtime="Hiding unmounts the input, so its text is lost.">
        <ActivityDemo />
      </Feature>
      <Feature name="forwardRef" runtime="The forwardRef input never receives its ref. The ref-prop input works.">
        <ForwardRefDemo />
      </Feature>
      <Feature name="portal" runtime="The portal content renders inside the outlined box, not in document.body.">
        <PortalDemo />
      </Feature>
      <Feature name="classComponents" runtime="render and setState work. componentDidMount never runs.">
        <ClassComponentsDemo />
      </Feature>
      <Feature name="lazy" runtime="Not rendered: async lazy() throws. See src/features/lazy.tsx." />
      <Feature name="hydration" runtime="Not called: hydrateRoot throws. See src/features/hydration.tsx." />
      <Feature name="memo" runtime="No type error. The child re-renders with its parent.">
        <MemoDemo />
      </Feature>
      <Feature name="viewTransitions" runtime="No type error. The content updates without animating.">
        <ViewTransitionsDemo />
      </Feature>
    </main>
  )
}

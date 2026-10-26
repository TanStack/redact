import { defineConfig } from 'vite'
import { redact } from '@tanstack/redact/vite'

export default defineConfig({
  plugins: [
    redact({
      // Every optional feature is off. Set one to `true`, then run `pnpm dev`
      // or `pnpm build`: the plugin rewrites src/redact.gen.d.ts and that
      // feature's type errors disappear from `pnpm typecheck`.
      features: {
        activity: false,
        classComponents: false,
        context: false,
        forwardRef: false,
        fragmentRefs: false,
        hydration: false,
        lazy: false,
        memo: false,
        portal: false,
        suspense: false,
        viewTransitions: false,
      },
    }),
  ],
})

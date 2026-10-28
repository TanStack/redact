# Inline metadata hydration fix

Base: main commit `89f2bfc58135fdf5fcb29af4c346680e0eda2763`.

Before the change, the added document-hydration regression fails with `expected <script> but found LINK`. The React Router 8.5.0 production fixture also replaces the original counter button. After the change, native React and Redact both preserve it in development and production. The fixture also checks state, server form actions, client navigation, and browser history. Saved JSON records contain the checks and DOM identity results.

The only application integration change is the Vite plugin's packageRoots option pointing to this built worktree package. No React Router source is patched.

Validation uses Node 24.22.0 from .nvmrc: 1,966 tests passed, 91 skipped; type checks, build verification and all original size limits passed. No size allowance was added.

The final implementation uses one metadata scan over element children and the optional original host location. It shares props, removes redundant tag normalization, and folds two single-use recovery helpers into their callers without changing recovery decisions.

The size comparison rebuilds baseline and fixed sources at the same checkout path with the same toolchain. The built default Vite client shrinks from 23,446 to 23,385 gzip bytes (-61), by 233 minified bytes and 7 Brotli bytes. The full built client shrinks by 45 gzip bytes, 230 minified bytes and 13 Brotli bytes. Source default Brotli increases by 19 bytes, recorded separately; source gzip shrinks by 66 bytes.

The independent React compatibility gate passes all 36 profile/entry/protocol comparisons with no growth in minified, gzip or Brotli output. It bundles published entries through Vite for React 18 and 19 in full, default and nano configurations. Its complete output is saved in react-compatibility-size.txt. No size budget or test was relaxed.

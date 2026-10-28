# Inline metadata hydration fix

Base: main commit `89f2bfc58135fdf5fcb29af4c346680e0eda2763`.

Before the change, the added document-hydration regression fails with `expected <script> but found LINK`. The React Router 8.5.0 production fixture also replaces the original counter button. After the change, native React and Redact both preserve it in development and production. The fixture also checks state, server form actions, client navigation, and browser history. Saved JSON records contain the checks and DOM identity results.

The only application integration change is the Vite plugin's packageRoots option pointing to this built worktree package. No React Router source is patched.

Validation uses Node 24.22.0 from .nvmrc: 1,966 tests passed, 91 skipped; type checks, build verification and all original size limits passed. No size allowance was added.

The final implementation shares the metadata props, reuses the cursor's scan for another parent, and reads the parent's localName directly. These remove duplicated lookup work while preserving the fallback to metadata emitted in place.

The size comparison rebuilds baseline and fixed sources at the same checkout path with the same toolchain. The built default Vite client stays at 23,446 gzip bytes and shrinks by 50 minified bytes. The full client shrinks by 4 gzip bytes and 47 minified bytes. Source bundles shrink by 6 and 7 gzip bytes respectively. Brotli is recorded separately and increases by 62 bytes for the default built bundle; the repository's enforced bundle metric is gzip.

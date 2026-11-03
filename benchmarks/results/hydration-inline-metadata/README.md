# Inline metadata hydration fix

Release base: `0c7274e17a3fade8396169bc6ed024903cd1252d` (0.2.2).

Before this fix, the document-hydration regression fails with `expected <script> but found LINK`. The before/ directory preserves the original production React Router reproduction on main 89f2bfc. The after/ results use the final local build on the release base and React Router 8.5.0. Native React and Redact both pass development and production, including original server DOM identity, state, form actions, navigation and history. The fixture points the Vite plugin's packageRoots option at the local package; no framework source is patched.

The metadata scan adopts nodes left in their original host location and preserves main's rollback-aware claim tracking. Shared scanning and small recovery cleanups offset the size of the fallback.

Validation on Node 24.22.0: 2,002 tests passed, 91 skipped. Types, build verification, existing source/dist size limits and all 36 compatibility size comparisons pass with the explicitly approved exception below.

| Published client bundle | Minified delta | Gzip delta | Brotli delta |
|---|---:|---:|---:|
| Full, React 19 | -212 | -26 | +16 |
| Full, React 18 | -212 | -17 | -18 |
| Default, React 19 | -212 | -31 | -35 |
| Default, React 18 | -212 | -34 | -27 |

All values are bytes relative to the release base, with matching React protocol/version settings. The complete measurements are in react-compatibility-size.txt. The user approved the 16-byte full React 19 Brotli cost. Its allowance is restricted to that exact base, profile, entry, runtime and metric; regression tests keep other comparisons at zero growth. No gzip or fixed source/dist budget was raised.

Reproduction: run `pnpm test:ci` and `pnpm test:compatibility:size` using the Node version in .nvmrc. The latter builds its own baseline from origin/main; use REACT_SIZE_BASE_REF=0c7274e17a3fade8396169bc6ed024903cd1252d after main moves.

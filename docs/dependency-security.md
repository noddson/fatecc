# Dependency security status

Reviewed on November 5, 2026 (America/Toronto) after the initial `npm ci` reported nine vulnerable package entries and two unreviewed install scripts. Audit results are a snapshot of published advisories, not a general security guarantee.

## Changes

| Dependency     | Previous locked version | Corrected version | Reason                                                                                                                 |
| -------------- | ----------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Zod            | 3.25.76                 | 4.6.7             | Fix oversized-collection validation resource consumption. Migrated records to the v4 API; no v3 compatibility imports. |
| Vitest         | 3.2.7                   | 4.1.12            | Fix mocker advisories and remove the vulnerable tinypool dependency.                                                   |
| Workbox's glob | 11.1.0                  | 14.0.3            | Fix cancellation handling, remove the deprecated release, and use patched minimatch transitively.                      |

`package.json` scopes the glob override to `workbox-build`, whose latest release still requests glob 11. Workbox uses only `globSync(pattern, { cwd, follow, ignore })`, which glob 14 preserves. The application uses neither glob's removed CLI nor undocumented exports. The production PWA build and offline test verify the actual generated files, rather than relying only on type compatibility. Remove the override when Workbox adopts a patched compatible dependency itself.

Sources: [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Zod migration guide](https://zod.dev/v4/changelog), [Vitest migration guide](https://v4.vitest.dev/guide/migration.html), [mocker path traversal](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [mocker registration](https://github.com/advisories/GHSA-qxg6-89mg-rqv8), [tinypool advisory](https://github.com/advisories/GHSA-85c8-ppgw-ccpr), [glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Remaining low advisory

The full audit reports four low package entries for **one underlying advisory**:

`vite-plugin-pwa → workbox-build → @rollup/plugin-node-resolve → deepmerge@4.3.1`

[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) remains active and has no patched deepmerge release. The latest inspected Workbox and node-resolve packages still depend on it. npm's suggested forced fix is a downgrade of `vite-plugin-pwa` to **0.2.1**, which is not a suitable repair for this Vite application. No vulnerability suppression or downgrade was applied.

In locked `@rollup/plugin-node-resolve@16.0.3`, the sole deepmerge call is `deepFreeze(deepMerge({}, defaults))` at module initialization; both inputs are package-owned literals. Plugin options are subsequently combined with object spread. Workbox calls `nodeResolve()` without arguments while building the service worker. No campaign, import, or peer-message input path into that call was identified. This is a narrow reachability assessment of the inspected build chain, not a fix to deepmerge itself. Source: [node-resolve initialization](https://github.com/rollup/plugins/blob/node-resolve-v16.0.3/packages/node-resolve/src/index.js).

Production dependencies report **zero known vulnerabilities** with `npm audit --omit=dev`. Recheck the complete audit during future dependency updates, including whether the remaining upstream issue has been patched.

## Install scripts

The project requires npm 11.17+ with Node 22.x (22.12+) or Node 24+. Node 23 is excluded because Vitest does not support it. `.npmrc` enforces those engines and enables `strict-allow-scripts`; it changes no user/global npm configuration. `package.json` permits only the reviewed **esbuild@0.25.12** lifecycle script and explicitly denies fsevents scripts.

The esbuild script validates its native binary and prepares the launcher; it can obtain a missing platform binary during installation. Keep optional dependencies enabled. `fsevents@2.3.3` ships a prebuilt macOS watcher and has no install lifecycle script in its package manifest, but its registry/lock metadata conservatively flags install scripts. Denying those scripts retains the prebuilt optional package.

In npm 11.17, the original pending-script warning means **unreviewed**, not necessarily blocked. `npm approve-scripts --allow-scripts-pending` is a read-only list; the corrected project has no unreviewed scripts. A future esbuild upgrade must be reviewed and its exact-version allowance updated; do not blanket-approve new scripts.

Sources: [npm 11.17 approve-scripts documentation](https://github.com/npm/cli/blob/v11.17.0/docs/lib/content/commands/npm-approve-scripts.md), [npm configuration](https://github.com/npm/cli/blob/v11.17.0/workspaces/config/lib/definitions/definitions.js), [esbuild installation flags](https://esbuild.github.io/getting-started/#additional-npm-flags), [fsevents 2.3.3 manifest](https://github.com/fsevents/fsevents/blob/v2.3.3/package.json).

## Verification

Verified on Node 26.5.1 and npm 11.17.0:

- A fresh `npm ci` installed 377 packages successfully, with no deprecated-glob or unreviewed-script warnings.
- All 134 unit tests passed, including 25 added import regressions for Zod 4. Invalid and oversized imports leave saved campaigns unchanged.
- TypeScript and the production build passed; the service worker precached 35 entries.
- Nine Chromium browser regressions passed, covering backup restoration, character imports, maps, responsive layout, signaling, and peer sessions including one GM plus seven players.
- The separate production PWA test passed: campaign restoration and bundled rule search work while offline.

Rollup currently emits two non-fatal annotation warnings about explanatory comments in Zod 4.6.7 containing the literal `@__PURE__`. It removes those comments; production generation and offline verification succeed. These warnings are separate from npm's security audit.

## QR pairing additions

QR generation and decoding add `qrcode@1.5.4`, `jsqr@1.4.0`, and development-only `@types/qrcode@1.5.6`. They use the already installed fflate package for bounded compression. After installation, the production audit still reports zero known vulnerabilities, the full audit remains at the same four low build-chain entries, and no install scripts need additional review. QR library licenses ship with the application in `public/LICENSE-QR.txt`. The unit suite now has 169 passing tests, including 35 QR cases; the QR browser and simulated-camera checks are recorded in `docs/networking.md`.

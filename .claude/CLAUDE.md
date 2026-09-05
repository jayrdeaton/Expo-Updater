# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

# @rific/updater

OTA update hook for Expo apps — silent background fetch on foreground, manual check with a confirmation dialog.

Part of the `@rific` package ecosystem. Published at https://www.npmjs.com/package/@rific/updater.

## Commands

```bash
npm run lint       # ESLint
npm run fix        # ESLint --fix
npm run build      # tsup, outputs CJS + ESM + types to dist/
npm run build:watch # tsup --watch
npm test           # Jest (50 tests: 38 hook + 12 scripts/lib)
npm run test:watch # Jest in watch mode
npm run typecheck  # tsc --noEmit
npm run verify     # lint + test + typecheck + build, in that order
```

Always run `npm run lint` before finishing any task.

## Release

Tag-based, using npm trusted publishing (OIDC, no token required):

```bash
npm run release:patch   # npm version patch && git push --follow-tags (or release:minor / release:major)
```

`preversion` runs `npm run verify` first. `prepublishOnly` runs `npm run build`. The `publish.yml` workflow fires on `v*` tags and delegates to the shared reusable workflow (`infinitetoken/Workflows/.github/workflows/npm-publish.yml@v1`) with `id-token: write` permission for OIDC trusted publishing. `ci.yml` runs the same fleet-shared quality workflow (`infinitetoken/Workflows/.github/workflows/npm-ci.yml@v1`) on PRs and pushes to `main`.

## Architecture

```
src/
  index.ts                 - all public exports
  types.ts                 - UpdateManifest interface: { createdAt: string }
  useUpdater.ts             - the hook: auto-check + manual check(), confirm/reload flow
  checkForUpdate.ts         - wraps expo-updates' checkForUpdateAsync/fetchUpdateAsync, returns UpdateManifest | null
  getUpdateConfirmation.ts  - default onConfirm: Alert.alert with Cancel/Restart, resolves a boolean
  globals.d.ts              - declares the `__DEV__` global (not in the default TS lib)
  __mocks__/
    expo-updates.ts          - jest mocks: checkForUpdateAsync, fetchUpdateAsync, reloadAsync
    react-native.ts          - jest mock: Alert.alert, Platform, and an AppState stub with __emit/__setCurrentState/__clearListeners test helpers
  __tests__/
    useUpdater.test.ts        - 38 tests, covers both mocks
scripts/
  bump-ota-version.cjs      - standalone CLI, see "Bump script" below
  build.cjs                 - standalone CLI, see "Build script" below
  update.cjs                - standalone CLI, see "Update script" below
  lib/
    bumpOtaVersion.cjs        - the bump-and-commit logic shared by bump-ota-version.cjs and update.cjs
    runVerify.cjs             - the verify-with-fallback logic shared by build.cjs and update.cjs
    validateProfile.cjs       - the eas.json profile-existence check shared by build.cjs and update.cjs
    __tests__/                - Jest tests for the three lib modules above, see "Testing" below
```

**Any file listed under `bin` in `package.json` (`bump-ota-version.cjs`, `build.cjs`, `update.cjs`) must keep its executable bit (`chmod +x`), or every consumer's `npm run` invocation fails with `Permission denied`.** Editing tools that overwrite a file's full content preserve the existing mode when the file already exists, but a genuinely new file (or one recreated after being deleted, e.g. during the `build-local.cjs` → `build.cjs` rename) lands at the default non-executable mode and needs `chmod +x` explicitly. Caught this exact way once already: every scratch test that called a script directly via `node scripts/build.cjs` kept passing throughout, since `node <file>` doesn't care about the file's own execute permission at all — only a real `npm run` invocation, which resolves the bin through its `node_modules/.bin` symlink, actually exercises this. `lib/bumpOtaVersion.cjs` is the one exception that doesn't need it: it's a plain required module, never listed in `bin`, never invoked directly.

### Verify script

`scripts/lib/runVerify.cjs` is the first thing both `build.cjs` and `update.cjs` run. It reads the consumer app's own `package.json` and runs `npm run verify` if that script exists — but neither script assumed it always would. Every app in the fleet happens to define `verify` today, but `build.cjs`/`update.cjs` are shared tooling other, less-conforming consumers could adopt later, and the old, un-guarded `execSync('npm run verify', ...)` would have thrown npm's raw "Missing script" error wrapped in an uncaught Node exception if it ever didn't exist — not a helpful failure for something meant to be the fleet's baseline safety check.

If `verify` is missing, it falls back to running `lint`, `test`, and `typecheck` individually (the exact three steps every app's own `verify` already expands to), printing a warning first. If any *one* of those three is also missing, it warns and skips just that one rather than failing the whole run — verified directly for all four combinations (verify present; verify absent with all three present; verify absent with one missing; nothing present at all), none of which throw.

### Update flow

`isUnsupported()` gates on `__DEV__ || Platform.OS === 'web'` — both the mount-time auto-check and manual `check()` are no-ops (well, `check()` still surfaces an `onInfo`/Alert message) in dev and on web, by design.

Auto-check runs once on mount (cold launch) and again on every `inactive|background` → `active` `AppState` transition, guarded by `autoCheckPendingRef` so overlapping `AppState` events can't trigger overlapping fetches. If an auto-check finds an update, the manifest is staged in `stagedManifest.current` and `updateReady` flips true; a subsequent manual `check()` reuses that staged manifest instead of re-fetching. `onConfirm`/`onError` are read through refs inside the `AppState` listener so passing new inline callbacks each render doesn't tear down and resubscribe the listener.

`onInfo` is purely informational — it covers the three plain-Alert paths inside `check()` (dev-mode disabled, web unsupported, already up to date) — distinct from `onConfirm`'s cancel/restart decision, which defaults to `getUpdateConfirmation`'s Alert-based prompt when not supplied.

### Bump script

`scripts/bump-ota-version.cjs` ships as the `rific-bump-ota` bin. It's now a thin CLI wrapper around `scripts/lib/bumpOtaVersion.cjs`'s `bumpOtaVersion(filePath, cwd?)` — the actual logic (bumps an `otaVersion: N` constant in a consumer repo's own file, default `src/constants/release.ts`, and auto-commits the change; refuses to run on a dirty git tree first) is shared with `update.cjs` (see below) rather than duplicated. Unrelated to the hook itself; a small utility for OTA-version bookkeeping in the app that consumes this package.

Originally `.mjs`, since it used `import`/`export` syntax while the rest of the package is `"type": "commonjs"` — genuinely required at the time, not a style choice (verified: renaming to plain `.js` under this package's explicit `"type"` throws `SyntaxError: Cannot use import statement outside a module`, and `.cjs` can't hold ESM syntax either). Converted to real CommonJS (`require()`/no top-level `import`) and renamed to `.cjs` instead, matching the fleet's convention — every import here is a Node builtin (`node:child_process`, `node:fs`, `node:path`), all fully `require()`-compatible, and nothing in the script depends on an ESM-only feature (no `import.meta`, no top-level `await`, no dynamic `import()`), so there was no actual blocker to rewriting it rather than keeping the extension mismatch.

### Build script

`scripts/build.cjs` ships as the `rific-updater-build` bin: `rific-updater-build <profile>`. One command covers both of a consumer app's build shapes — cloud (`eas build --profile <profile>`, used for `preview`/`production`) and local (`expo prebuild --clean && eas build --profile <profile> --local`, used for `development`) — rather than a separate tool per shape, so a consumer's `build:development`/`build:preview`/`build:production` all reduce to one bare `"build": "rific-updater-build"` script, invoked as `npm run build <profile>`.

Whether a given profile builds locally is derived internally from `profile === 'development'`, not passed as a flag. This went back and forth twice before settling here, worth recording so it doesn't get re-litigated from scratch:

1. First cut: explicit `--local` flag, one script per profile (`build:development`/`build:preview`/`build:production`). Symmetric, everything visible in `package.json`.
2. Tried collapsing to one bare `"build": "rific-updater-build"` script — but npm silently drops any `--flag`-shaped argument that isn't separated by a literal `--` (`npm run build development --local` reaches the script as just `["development"]`; no error, no warning, `--local` simply never arrives). Confirmed empirically (a throwaway script logging its own `process.argv`), not assumed. That makes an explicit flag incompatible with a single collapsed script — `npm run build development --local` would silently run a *cloud* build instead of local, no error, just wrong.
3. Reverted to three explicit per-profile scripts, reasoning that visibility in `package.json` mattered more than the line count.
4. Landed here instead, after remembering this isn't one app's `package.json`, it's the same handful of lines repeated across ~24 apps. At that scale, "each app can independently type the flag right" isn't free — this exact fleet has already drifted on a *simpler* repeated string before (`build:development` silently missing its `npm run verify && ` prefix in two apps — see the shared reasoning several consumer apps' own CLAUDE.md files cite). A profile-to-behavior mapping that's true for the whole fleet with zero exceptions belongs in one place, not in 24 independently-editable copies. The opacity cost is real but cheap to mitigate: `rific-updater-build` with no profile prints a usage message stating the convention outright, so the one moment this would actually confuse someone (running it bare, or forgetting the rule months later) is met with an immediate, explicit answer instead of a silent wrong result.

The `--local` branch additionally relocates the resulting artifact out of the project root into `~/Downloads/Builds/<expo.name>-<local-timestamp>.<ext>` — one shared, browsable location across every app that depends on this package, instead of each app scattering its own `build-<epoch-ms>.<ext>` file in its own root (eas-cli's upstream default with no `--output` flag).

Deliberately does *not* pass `eas build`'s own `--output` flag to control this: `--output` needs a full static path fixed before the build runs, which would mean either forcing `--platform` up front (removing the interactive iOS/Android prompt every consumer currently gets) or predicting the real output extension ourselves — and `eas-cli-local-build-plugin` copies whatever `--output` says with no validation that the extension actually matches the artifact, so a wrong guess silently mislabels the file (e.g. an `.aab` copied into a file named `.apk`). Instead, the build runs exactly as it always has (interactive prompt included), and afterward the script finds the `build-<epoch>.<ext>` file the plugin just wrote — self-identifying via the epoch already in its own filename — and moves it. Uses `fs.copyFileSync` + `fs.unlinkSync` rather than `fs.renameSync`, so it can't fail with `EXDEV` if the project directory and `~/Downloads` ever end up on different volumes.

Reads the project name from `app.json`'s `expo.name`, not `package.json`'s `name` — the latter is inconsistently formatted across consumer apps (e.g. `"box-hockey"` vs. the app's actual name `"BoxHockey"`), while `expo.name` consistently matches the app's real, human-facing name. Only read on the `--local` branch — the cloud path never needs a project name at all.

Runs verify (via `runVerify`, see "Verify script" above) as its own first step, same reasoning as the update script below.

Unrelated to the hook itself, same as the bump script above — a small utility for build bookkeeping in the app that consumes this package.

### Update script

`scripts/update.cjs` ships as the `rific-updater-update` bin: `rific-updater-update <profile> [releaseFile]`, where `<profile>` is an `eas.json` build-profile name (`development`/`preview`/`production` across the fleet, though nothing here hardcodes that list). Replaces the fleet-wide pattern of a shared `update` script plus three `update:<profile>` scripts that each passed `npm run update -- --branch <profile> --environment <profile> --message "$(git log -1 --pretty=%B)"` (and `--non-interactive` on all but `development`) — every consumer app was repeating the same `branch === environment === profile` pairing and the same message logic inline, three times each. A consumer's `update:development`/`update:preview`/`update:production` now all reduce to one bare `"update": "rific-updater-update"` script, invoked as `npm run update <profile>`.

`--non-interactive` is derived internally from `profile !== 'development'`, the same call as `build.cjs`'s local-vs-cloud decision and for the same reason — see that script's own note above on why an earlier explicit-flag revision was reverted. Both scripts now share one real mechanic (derive everything from the bare profile name, no flags at the call site at all), not just a naming convention. Same mitigation too: running `rific-updater-update` with no profile prints the convention (`'development' publishes interactively, every other profile publishes with --non-interactive`), not just a bare usage string.

Deliberately captures `git log -1 --pretty=%B` *before* calling `bumpOtaVersion`, not after — `bumpOtaVersion` makes its own `"otaVersion N -> N+1"` commit, so capturing the message afterward (which is what the old `npm run update -- ... "$(git log ...)"` scripts did, since `&&`-chained shell commands expand each command's own substitutions immediately before *that* command runs, not upfront) would pass EAS the auto-bump commit's message instead of the app's real last commit. Verified empirically (a throwaway git repo + a two-step chained npm script) before relying on this, not just reasoned about — this was a real, silent bug in every app's OTA update history to date, not a hypothetical.

Passes `--message` to `eas update` via `execFileSync('eas', [...])` — a real argv array, not a shell string — rather than interpolating the message into a command string the way `build.cjs`'s `run()` helper does for `expo prebuild`/`eas build` (safe there only because those commands never carry free-form text as an argument). A commit message can be multi-line or contain quotes; building a shell-escaped string for it (e.g. via `JSON.stringify`) would mangle embedded newlines the moment bash re-parses `\n` as a literal two-character escape rather than a real line break. `execFileSync` sidesteps shell parsing entirely, so the message survives byte-for-byte.

Runs verify (via `runVerify`, see "Verify script" above) as its own first step too, before capturing the commit message or bumping anything — every consumer app was already prefixing `npm run verify && ` onto every one of these scripts individually (4 lines × every app); baking it into both `rific-updater-build` and `rific-updater-update` themselves removes the last piece of that duplication and means it can't be forgotten on a new app or a new profile.

Unrelated to the hook itself, same as the other two scripts above — a small utility for OTA-release bookkeeping in the app that consumes this package.

## Public API

From `src/index.ts`:

- `useUpdater(options?)` — the hook. Returns `{ check, checking, updateReady }`
- `UseUpdaterOptions` (type) — `autoCheck?`, `autoPrompt?`, `onConfirm?`, `onError?`, `onInfo?`
- `UseUpdaterReturn` (type) — `check`, `checking`, `updateReady`
- `UpdateManifest` (type only) — `{ createdAt: string }`

## Peer Dependencies

- `expo-updates` >=57.0.0 — required
- `react` >=19.0.0 — required
- `react-native` >=0.76.0 — required

## Testing

- Framework: Jest (`@infinitetoken/jest-config/react-native`), jsdom environment
- Mocks in `src/__mocks__/` for `react-native` and `expo-updates`
- 38 hook tests in one suite (`src/__tests__/useUpdater.test.ts`)
- Coverage: 99.12% statements / 92.98% branches / 100% functions / 98.95% lines — well above the preset's 70/70/70/70 default, no local threshold override
- When adding new hook behavior, add a corresponding test case

**`scripts/lib/` has its own 12 tests, in `scripts/lib/__tests__/*.test.cjs`**, covering `validateProfile`, `runVerify`, and `bumpOtaVersion` — the three modules that actually hold decision logic, as opposed to `build.cjs`/`update.cjs` themselves, which are now thin orchestrators over those three plus a couple of direct `eas`/`expo` calls, already exercised by this session's manual end-to-end smoke tests (real `npm run build`/`npm run update` invocations against stubbed `npm`/`eas`/`expo` binaries) rather than as permanent Jest tests. Getting these discovered at all required two `jest.config.cjs` changes beyond `moduleNameMapper`: `roots` defaults to `['<rootDir>/src']` (inherited from `@infinitetoken/jest-config/node`) and `testMatch` defaults to `.test.ts`/`.test.tsx` only, so `scripts/` was invisible to Jest without explicitly widening both. Each `scripts/lib/__tests__/*.test.cjs` file sets `/** @jest-environment node */` at the top rather than inheriting this package's `jsdom` default, since these test plain `fs`/`child_process`/`git` interactions with no relation to the React hook.

Uses real `fs.mkdtempSync` temp directories (and, for `bumpOtaVersion`, a real temp git repo) rather than mocking `fs`/`git` — only `runVerify`'s tests mock `node:child_process`'s `execSync`, since actually running `npm run <script>` from inside a test would be slow and the point there is asserting *which* commands get invoked, not exercising real script execution. `process.exit` is mocked to throw a `EXIT:<code>` marker rather than a no-op, so a test halts at the same point the real process would rather than falling through into whatever code follows an unmocked exit.

## Code Style

Enforced by ESLint + Prettier, run `npm run lint` before finishing any task.

**Prettier config:**
- Single quotes, JSX single quotes
- No semicolons
- No trailing commas
- Print width: 1000 (effectively disabled)

**ESLint rules (warnings unless noted):**
- `simple-import-sort` — imports and exports must be sorted
- `react-native/no-inline-styles` — no inline style objects
- `react-native/no-unused-styles` — no unused StyleSheet entries
- `no-console` — no console statements
- `@typescript-eslint/no-unused-vars` — `_`-prefixed vars/args/caught-errors are exempt (centralized in the shared preset)
- `react-hooks/rules-of-hooks` — error, not a warning
- `react-hooks/exhaustive-deps`, `react-hooks/refs`, `react-hooks/immutability`, `react-hooks/preserve-manual-memoization`, `react-hooks/set-state-in-effect`

No local ESLint or tsconfig overrides beyond a bare `require('@infinitetoken/eslint-config/react-native')` and one deliberate tsconfig change: `lib: ["ES2020"]` (no DOM) — this is a headless RN/Expo hook package with no browser target, overriding the `/react-native` preset's DOM-inclusive default.

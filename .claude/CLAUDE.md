# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

# @rific/updater

OTA update hook for Expo apps - silent background fetch on foreground, manual check with a confirmation dialog.

Part of the `@rific` package ecosystem. Published at https://www.npmjs.com/package/@rific/updater.

## Commands

```bash
npm run lint       # ESLint
npm run fix        # ESLint --fix
npm run build      # tsup, outputs CJS + ESM + types to dist/
npm run build:watch # tsup --watch
npm test           # Jest (38 hook tests)
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
```

## Build and update tooling: removed in 0.7.0

This package used to ship `rific-updater-build`, `rific-updater-update` and `rific-bump-ota` bins (`scripts/`). They moved to Jay's own CLI, `jrd ship` (`@jayrdeaton/scripts`, `~/Developer/Scripts`), in October 2026, and 0.7.0 deleted them: apps' `build`/`update` scripts are plain `eas build`/`eas update`. Their design history (the `prebuild` hook collision, profile-derived local/cloud and `--non-interactive`, capturing the commit message before the OTA bump) is in this repo's git history and carries over to `jrd ship`. Don't add CLI tooling back here: the package is just the OTA update hook its description says it is.

### Update flow

`isUnsupported()` gates on `__DEV__ || Platform.OS === 'web'` - both the mount-time auto-check and manual `check()` are no-ops (well, `check()` still surfaces an `onInfo`/Alert message) in dev and on web, by design.

Auto-check runs once on mount (cold launch) and again on every `inactive|background` → `active` `AppState` transition, guarded by `autoCheckPendingRef` so overlapping `AppState` events can't trigger overlapping fetches. If an auto-check finds an update, the manifest is staged in `stagedManifest.current` and `updateReady` flips true; a subsequent manual `check()` reuses that staged manifest instead of re-fetching. `onConfirm`/`onError` are read through refs inside the `AppState` listener so passing new inline callbacks each render doesn't tear down and resubscribe the listener.

`onInfo` is purely informational - it covers the three plain-Alert paths inside `check()` (dev-mode disabled, web unsupported, already up to date) - distinct from `onConfirm`'s cancel/restart decision, which defaults to `getUpdateConfirmation`'s Alert-based prompt when not supplied.

## Public API

From `src/index.ts`:

- `useUpdater(options?)` - the hook. Returns `{ check, checking, updateReady }`
- `UseUpdaterOptions` (type) - `autoCheck?`, `autoPrompt?`, `onConfirm?`, `onError?`, `onInfo?`
- `UseUpdaterReturn` (type) - `check`, `checking`, `updateReady`
- `UpdateManifest` (type only) - `{ createdAt: string }`

## Peer Dependencies

- `expo-updates` >=57.0.0 - required
- `react` >=19.0.0 - required
- `react-native` >=0.76.0 - required

## Testing

- Framework: Jest (`@infinitetoken/jest-config/react-native`), jsdom environment
- Mocks in `src/__mocks__/` for `react-native` and `expo-updates`
- 38 hook tests in one suite (`src/__tests__/useUpdater.test.ts`)
- Coverage: 99.12% statements / 92.98% branches / 100% functions / 98.95% lines - well above the preset's 70/70/70/70 default, no local threshold override
- When adding new hook behavior, add a corresponding test case

## Code Style

Enforced by ESLint + Prettier, run `npm run lint` before finishing any task.

**Prettier config:**
- Single quotes, JSX single quotes
- No semicolons
- No trailing commas
- Print width: 1000 (effectively disabled)

**ESLint rules (warnings unless noted):**
- `simple-import-sort` - imports and exports must be sorted
- `react-native/no-inline-styles` - no inline style objects
- `react-native/no-unused-styles` - no unused StyleSheet entries
- `no-console` - no console statements
- `@typescript-eslint/no-unused-vars` - `_`-prefixed vars/args/caught-errors are exempt (centralized in the shared preset)
- `react-hooks/rules-of-hooks` - error, not a warning
- `react-hooks/exhaustive-deps`, `react-hooks/refs`, `react-hooks/immutability`, `react-hooks/preserve-manual-memoization`, `react-hooks/set-state-in-effect`

No local ESLint or tsconfig overrides beyond a bare `require('@infinitetoken/eslint-config/react-native')` and one deliberate tsconfig change: `lib: ["ES2020"]` (no DOM) - this is a headless RN/Expo hook package with no browser target, overriding the `/react-native` preset's DOM-inclusive default.

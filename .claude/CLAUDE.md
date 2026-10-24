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
npm test           # Jest (55 tests)
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
  network.ts               - ExpoNetworkModule/ExpoNetworkState (local mirror of the two expo-network calls) and isUnmetered (Wi-Fi or Ethernet)
  useUpdater.ts             - the hook: auto-check + manual check(), confirm/reload flow
  checkForUpdate.ts         - wraps expo-updates' checkForUpdateAsync/fetchUpdateAsync, returns UpdateManifest | null
  getUpdateConfirmation.ts  - default onConfirm: Alert.alert with Cancel/Restart, resolves a boolean
  globals.d.ts              - declares the `__DEV__` global (not in the default TS lib)
  __mocks__/
    expo-updates.ts          - jest mocks: checkForUpdateAsync, fetchUpdateAsync, reloadAsync, and a checkAutomatically value with a __setCheckAutomatically helper
    react-native.ts          - jest mock: Alert.alert, Platform, and an AppState stub with __emit/__setCurrentState/__clearListeners test helpers
  __tests__/
    useUpdater.test.ts        - 52 tests, covers both mocks plus a fake injected expo-network
    network.test.ts           - isUnmetered, and a compile-time check that the real expo-network fits ExpoNetworkModule
```

## Build and update tooling: removed in 0.7.0

This package used to ship `rific-updater-build`, `rific-updater-update` and `rific-bump-ota` bins (`scripts/`). 0.7.0 (2026-10-15) deleted them: apps' `build`/`update` scripts are plain `eas build`/`eas update`. Their design history (the `prebuild` hook collision, profile-derived local/cloud and `--non-interactive`, capturing the commit message before the OTA bump) is in this repo's git history. Don't add CLI tooling back here: the package is just the OTA update hook its description says it is.

### Update flow

`isUnsupported()` gates on `__DEV__ || Platform.OS === 'web'` - both the mount-time auto-check and manual `check()` are no-ops (well, `check()` still surfaces an `onInfo`/Alert message) in dev and on web, by design.

Auto-check runs once on mount (cold launch) and again on every `inactive|background` → `active` `AppState` transition, guarded by `autoCheckPendingRef` so overlapping `AppState` events can't trigger overlapping fetches. If an auto-check finds an update, the manifest is staged in `stagedManifest.current` and `updateReady` flips true; a subsequent manual `check()` reuses that staged manifest instead of re-fetching. `onConfirm`/`onError` are read through refs inside the `AppState` listener so passing new inline callbacks each render doesn't tear down and resubscribe the listener.

### checkAutomatically and Wi-Fi only (2026-10-23)

expo-updates' `updates.checkAutomatically` (app.json, read at runtime as `Updates.checkAutomatically`) only governs its native launch check, which downloads silently and applies on the next cold launch. The hook's own checks used to ignore it, so a `WIFI_ONLY` app still downloaded over cellular on every foreground. Now the auto-check effect reads it: `NEVER` and `ON_ERROR_RECOVERY` return before any check or listener (as `autoCheck: false`), `ON_LOAD` and `null` (expo-updates disabled) behave as before, and `WIFI_ONLY` gates each fetch on `expoNetwork.getNetworkStateAsync()` (`isUnmetered`: `WIFI` or `ETHERNET`; Android's native check asks whether the network is metered, iOS's whether it's Wi-Fi). `WIFI_ONLY` with no `expoNetwork` makes no auto-checks at all, leaving expo-updates' own launch check. Manual `check()` ignores the setting: the user asked.

- **Wi-Fi coming back:** an `addNetworkStateListener` subscription runs a check when the connection turns unmetered from a known metered one (`onWifi === false`, so a check still reading the network covers the unknown case) while `AppState` is active. It runs with `prompt: false`: it only stages, since it can fire mid-task, unlike a launch or foreground.
- **Prompting a staged update off Wi-Fi:** a check that may not fetch (or whose fetch finds nothing) falls back to `stagedManifest.current`, so the next foreground prompts for what the Wi-Fi check staged without downloading again. Under `ON_LOAD` with `autoPrompt: true` nothing is ever left staged outside a prompt, so this changes nothing there.
- **Why `expoNetwork` is injected:** the @rific `OptionalModule` convention (pass `import * as ExpoNetwork from 'expo-network'`, mirror only the calls used as a local type), like auto-paper's `expoBlur`, so apps that never use `WIFI_ONLY` don't need expo-network. It's an optional peer and a devDependency (the package-json lint rule wants every peer declared locally). It's in the effect's deps, so pass the module itself, not a new object each render.
- **Not in @rific/core:** one consumer today. If `@rific/sync` or another package needs "is this connection cheap", lift `isUnmetered` and the mirror type into core then.

`onInfo` is purely informational - it covers the three plain-Alert paths inside `check()` (dev-mode disabled, web unsupported, already up to date) - distinct from `onConfirm`'s cancel/restart decision, which defaults to `getUpdateConfirmation`'s Alert-based prompt when not supplied.

## Public API

From `src/index.ts`:

- `useUpdater(options?)` - the hook. Returns `{ check, checking, updateReady }`
- `UseUpdaterOptions` (type) - `autoCheck?`, `autoPrompt?`, `expoNetwork?`, `onConfirm?`, `onError?`, `onInfo?`
- `UseUpdaterReturn` (type) - `check`, `checking`, `updateReady`
- `UpdateManifest` (type only) - `{ createdAt: string }`
- `ExpoNetworkModule`, `ExpoNetworkState` (types only) - the slice of expo-network `expoNetwork` takes

## Peer Dependencies

- `expo-network` >=57.0.0 - optional, only for `WIFI_ONLY` apps (injected as `expoNetwork`, never imported)
- `expo-updates` >=57.0.0 - required
- `react` >=19.0.0 - required
- `react-native` >=0.76.0 - required

## Testing

- Framework: Jest (`@infinitetoken/jest-config/react-native`), jsdom environment
- Mocks in `src/__mocks__/` for `react-native` and `expo-updates`
- 55 tests in two suites: 52 hook tests (`src/__tests__/useUpdater.test.ts`) and 3 for `network.ts`
- `expoNetwork` is a plain fake in `useUpdater.test.ts` (`setNetwork` changes the type and fires its listeners), not a module mock, since the hook never imports expo-network
- Coverage: 99.27% statements / 95% branches / 100% functions / 99.12% lines - well above the preset's 70/70/70/70 default, no local threshold override
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

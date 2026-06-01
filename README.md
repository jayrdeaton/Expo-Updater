# @rific/updater

OTA update hook for Expo apps. Silently stages updates in the background when the app is foregrounded, and exposes a manual `check()` for settings screens. No surprise restarts — the user always confirms before the app reloads.

---

## Install

```sh
npm install @rific/updater
```

**Peer dependencies:** `expo-updates`, `react`, `react-native`

---

## Usage

### Basic

```tsx
import { useUpdater } from '@rific/updater'

const { check, checking, updateReady } = useUpdater()
```

Call `check()` from a "Check for Updates" button. The `updateReady` flag goes `true` after a silent background fetch — use it to show a badge on your settings icon.

### Settings screen

```tsx
const { check, checking, updateReady } = useUpdater({
  onError: (msg) => toast(msg),
})

<MenuItem
  title="Check for Update"
  caption={`v${release.otaVersion}${updateReady ? ' — update ready' : ''}`}
  loading={checking}
  onPress={check}
/>
```

### With a custom confirm dialog

```tsx
const { check, checking } = useUpdater({
  onConfirm: async (manifest) => {
    // return true to proceed with reload, false to cancel
    return myCustomDialog(manifest)
  },
})
```

### Disable automatic foreground check

```tsx
const { check, checking } = useUpdater({ autoCheck: false })
```

---

## API

### `useUpdater(options?)`

```ts
interface UseUpdaterOptions {
  autoCheck?: boolean                                    // default: true
  onConfirm?: (manifest: UpdateManifest) => Promise<boolean>
  onError?: (message: string) => void
}

interface UseUpdaterReturn {
  check: () => Promise<void>
  checking: boolean
  updateReady: boolean
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `autoCheck` | `true` | Registers an `AppState` listener that silently fetches available updates whenever the app comes to the foreground. Disable for games or apps that want full manual control. |
| `onConfirm` | — | Custom confirmation dialog. Receives the update manifest, must return `Promise<boolean>` — `true` to reload, `false` to cancel. Defaults to a native `Alert` showing the release date and metadata message. |
| `onError` | — | Called with an error message string if `check()` throws. Defaults to `Alert.alert`. |

| Return | Description |
|--------|-------------|
| `check()` | Manual update check. Shows a dev/web guard alert if unsupported. If a background fetch already staged an update, uses that manifest directly (no extra network call). Clears `updateReady` on completion regardless of whether the user confirmed. |
| `checking` | `true` while `check()` is in flight. Safe to drive a loading spinner. Concurrent calls are ignored via a ref guard. |
| `updateReady` | `true` after the background fetch successfully staged an update. Cleared when `check()` completes. Use to show a badge on a settings button. |

---

## How updates work

**Automatic (foreground):** When `autoCheck` is `true`, the hook registers an `AppState` listener. Each time the app returns from background/inactive to active, it calls `checkForUpdateAsync()` + `fetchUpdateAsync()` silently. The downloaded bundle sits on disk — no prompt, no restart. The **next cold launch** automatically runs it.

**Manual (`check()`):** Runs the full flow — check (or reuse staged manifest) → confirmation dialog → `reloadAsync()`. The user sees what was released and chooses whether to restart now.

**Web / DEV:** Both are no-ops. `check()` shows an informational alert explaining why. The foreground listener is never registered.

---

## OTA version constant

Each app maintains a local integer version displayed to users (separate from the semver app version). Bump it before pushing an OTA:

```sh
# from your app's root
npx rific-bump-ota src/constants/release.ts
```

Or add to your app's `package.json`:

```json
"scripts": {
  "update:bump": "rific-bump-ota src/constants/release.ts"
}
```

The script:
- Verifies git working directory is clean
- Increments `otaVersion` in the target file
- Auto-commits `"otaVersion N -> N+1"`

File format expected (TypeScript or JS object literal):

```ts
export const release = {
  otaVersion: 1
}
```

The path argument defaults to `src/constants/release.ts` if omitted.

---

## Context / design notes

- Named `@rific/updater` (not `expo-updater`) to avoid confusion with the `expo-updates` peer dependency
- `check()` uses a ref guard (`checkingRef`) rather than the `checking` state to prevent concurrent calls — state batching means a second call could see stale `false` before the first render commits
- `updateReady` and the staged manifest ref are cleared in `finally` so they reset on both confirm and cancel
- `onConfirm` replaces the default `Alert` entirely — useful in apps that have their own dialog primitive (e.g. a `select()` utility or bottom sheet)
- No Provider or context required — the hook is self-contained

---

## Consuming apps

- **Lumber** (`../Lumber`) — account screen, shows version + update badge
- **CashierFu-Utility** (`../CashierFu-Utility`) — settings modal, uses `@rific/toaster` for `onError`
- Games (Setter, Hangman, Crumby, HexFleet, etc.) — use `autoCheck: true`, no manual check needed

### Local development (yalc)

```sh
# in this repo
yalc publish

# in the consuming app
yalc add @rific/updater
```

Use `yalc` not `npm link` — Metro doesn't resolve symlinks reliably.

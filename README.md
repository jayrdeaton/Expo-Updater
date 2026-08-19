# @rific/updater

OTA update hook for Expo apps. Checks for updates on launch and again whenever the app is foregrounded, prompting to restart as soon as one's found, and exposes a manual `check()` for settings screens. No surprise restarts — the user always confirms before the app reloads.

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

By default this is enough — a foreground fetch that finds an update shows the confirm dialog on its own, no button needed. `check()` is there for an explicit "Check for Updates" button/menu item. Pair it with `autoPrompt: false` (see below) if you'd rather have foreground fetches stage silently and only prompt from that button — then `updateReady` going `true` is your cue to show a badge on it.

### Settings screen with a persistent "update ready" badge

```tsx
const { check, checking, updateReady } = useUpdater({
  autoPrompt: false,
  onError: (msg) => toast(msg),
})

<MenuItem
  title="Check for Update"
  caption={`v${release.otaVersion}${updateReady ? ' — update ready' : ''}`}
  loading={checking}
  onPress={check}
/>
```

`autoPrompt: false` is what makes `updateReady` a useful, persistent badge signal here — foreground fetches stage silently instead of immediately consuming the manifest into a dialog, so it stays `true` until the user taps through `check()`.

### With a custom confirm dialog

```tsx
const { check, checking } = useUpdater({
  onConfirm: async (manifest) => {
    // return true to proceed with reload, false to cancel
    return myCustomDialog(manifest)
  },
})
```

### Disable automatic mount/foreground checks entirely

```tsx
const { check, checking } = useUpdater({ autoCheck: false })
```

Fully manual — no mount-time fetch, no `AppState` listener, `check()` always fetches fresh. `autoPrompt` is irrelevant here.

### Silent background staging only (no auto-prompt)

```tsx
const { check, checking, updateReady } = useUpdater({ autoPrompt: false })
```

Mount and foreground fetches still run and stage the update (`updateReady` flips `true`), but the confirm dialog only shows up via a manual `check()` — same as the settings-screen example above. Good for games or anything where you don't want a dialog interrupting the user.

---

## API

### `useUpdater(options?)`

```ts
interface UseUpdaterOptions {
  autoCheck?: boolean                                    // default: true
  autoPrompt?: boolean                                   // default: true
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
| `autoCheck` | `true` | Fetches available updates once on mount and again via an `AppState` listener whenever the app comes to the foreground. Disable for apps that want full manual control. |
| `autoPrompt` | `true` | When a mount or foreground `autoCheck` fetch finds an update, run the confirmation dialog (and reload on confirm) immediately. Set `false` to fall back to the old behavior — silently stage it for a manual `check()` or the next cold launch instead. Ignored if `autoCheck` is `false`. A manual `check()` call and an auto-prompt won't run concurrently — whichever is in flight blocks the other. |
| `onConfirm` | — | Custom confirmation dialog. Receives the update manifest, must return `Promise<boolean>` — `true` to reload, `false` to cancel. Defaults to a native `Alert` showing the release date and metadata message. |
| `onError` | — | Called with an error message string if `check()` throws. Defaults to `Alert.alert`. |

| Return | Description |
|--------|-------------|
| `check()` | Manual update check. Shows a dev/web guard alert if unsupported. If a background fetch already staged an update (`autoPrompt: false`), uses that manifest directly (no extra network call). Clears `updateReady` on completion regardless of whether the user confirmed. |
| `checking` | `true` while `check()` — or an `autoPrompt` auto-prompt — is in flight. Safe to drive a loading spinner. Concurrent calls are ignored via a ref guard. |
| `updateReady` | `true` once a fetch has staged an update. With the default `autoPrompt: true` this is transient (cleared as soon as the dialog resolves); with `autoPrompt: false` it persists until `check()` runs, so it's the useful signal for a settings badge there. |

---

## How updates work

**Automatic (mount + foreground):** When `autoCheck` is `true`, the hook fetches once on mount (covering cold launch) and also registers an `AppState` listener that re-fetches each time the app returns from background/inactive to active. Both paths call `checkForUpdateAsync()` + `fetchUpdateAsync()` and share the same confirm/reload flow. By default (`autoPrompt: true`) a found update goes straight into the confirmation dialog and `reloadAsync()` on confirm — no tap required. With `autoPrompt: false`, the downloaded bundle just sits on disk instead — no prompt, no restart — until a manual `check()` is called.

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
- `autoPrompt`'s foreground flow shares that same `checkingRef` guard with `check()`, so a manual check and an auto-prompt can't both be mid-confirm at once
- `updateReady` and the staged manifest ref are cleared in `finally` so they reset on both confirm and cancel
- `onConfirm` replaces the default `Alert` entirely — useful in apps that have their own dialog primitive (e.g. a `select()` utility or bottom sheet)
- No Provider or context required — the hook is self-contained

---

## Consuming apps

> **0.3.0 changed the default:** `autoPrompt` now defaults to `true`, so a bare `useUpdater()` prompts on its own the moment a foreground fetch finds something — it no longer just stages silently for next launch. Every app below was written against the old silent-by-default behavior; pass `autoPrompt: false` explicitly if that's still what you want (this is what Lumber's and CashierFu-Utility's manual-check hooks already do via `autoCheck: false`, so they're unaffected — it's the bare root-layout `useUpdater()` calls and the games that actually change behavior on upgrade).
>
> **Next release adds a mount-time check:** `autoCheck` now also fetches once on mount, in addition to the existing foreground `AppState` listener — covering cold launch, which previously only got an update via native `expo-updates` (`checkAutomatically`), silently and outside this hook's confirm/reload flow. Any app with a bare root-layout `useUpdater()` (default `autoPrompt: true`) will now show the confirm dialog on cold launch too, not just on foreground return.

- **Lumber** (`../Lumber`) — account screen, shows version + update badge. Root layout's bare `useUpdater()` will start auto-prompting on upgrade unless changed.
- **CashierFu-Utility** (`../CashierFu-Utility`) — settings modal, uses `@rific/toaster` for `onError`. Same root-layout caveat as Lumber.
- **Swirlio** (`../Swirlio`) — top sheet; now just relies on the `autoPrompt` default rather than passing it explicitly.
- Games (Setter, Hangman, Crumby, HexFleet, etc.) — call `useUpdater()` with no options, relying on the old silent-only default. Will start prompting on cold launch and on foreground return (not during active play — the listener only fires on a background→active transition) unless given `autoPrompt: false`.

### Local development (yalc)

```sh
# in this repo
yalc publish

# in the consuming app
yalc add @rific/updater
```

Use `yalc` not `npm link` — Metro doesn't resolve symlinks reliably.

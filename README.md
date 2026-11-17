# @rific/updater

OTA update hook for Expo apps. Checks for updates on launch and again whenever the app is foregrounded, prompting to restart as soon as one's found, and exposes a manual `check()` for settings screens. No surprise restarts - the user always confirms before the app reloads.

**[Live demo](https://rific.jaydeaton.com/demos/updater)**: OTA updates don't exist on the web, so the full behavior needs iOS or Android.

---

## What it adds to expo-updates

expo-updates already checks on its own. Its `updates.checkAutomatically` setting in app.json (`ON_LOAD` by default) checks at every cold launch, downloads in the background, and applies the update on the *next* cold launch. That leaves three gaps this hook fills:

- **Only at cold launch.** iOS and Android keep a backgrounded app alive for days, so an app reopened from the app switcher can run the old bundle long after an update shipped. This hook checks again every time the app comes to the foreground.
- **Silent.** A downloaded update waits for the next cold launch and nothing tells the user. This hook offers a restart right away (or raises a badge, with `autoPrompt: false`), and never restarts without a yes.
- **No button.** `check()` backs a "Check for Updates" row, with `checking` and `updateReady` for its spinner and badge.

expo-updates' own `useUpdates()` hook reports state (`isUpdateAvailable`, `isUpdatePending`, download progress) but starts no checks and shows nothing. This hook decides when to check and when to ask.

It also works the other way: `checkAutomatically` only governs expo-updates' own launch check, so setting it to `WIFI_ONLY` or `NEVER` never stopped this hook's checks. The hook now reads the same setting and follows it (see [Wi-Fi only](#wi-fi-only)), so one setting covers both.

---

## Install

```sh
npm install @rific/updater
```

**Peer dependencies:** `expo-updates`, `expo-asset`, `expo-constants`, `react`, `react-native` (every Expo app has the two `expo-*` ones through `expo`). Optional: `expo-network`, for apps whose `checkAutomatically` is `WIFI_ONLY` (passed in as `expoNetwork`, see [Wi-Fi only](#wi-fi-only)).

---

## Usage

### Basic

```tsx
import { useUpdater } from '@rific/updater'

const { check, checking, updateReady } = useUpdater()
```

By default this is enough - a foreground fetch that finds an update shows the confirm dialog on its own, no button needed. `check()` is there for an explicit "Check for Updates" button/menu item. Pair it with `autoPrompt: false` (see below) if you'd rather have foreground fetches stage silently and only prompt from that button - then `updateReady` going `true` is your cue to show a badge on it.

### Settings screen with a persistent "update ready" badge

```tsx
const { check, checking, updateReady } = useUpdater({
  autoPrompt: false,
  onError: (msg) => toast(msg),
})

<MenuItem
  title="Check for Update"
  caption={`v${release.otaVersion}${updateReady ? ' - update ready' : ''}`}
  loading={checking}
  onPress={check}
/>
```

`autoPrompt: false` is what makes `updateReady` a useful, persistent badge signal here - foreground fetches stage silently instead of immediately consuming the manifest into a dialog, so it stays `true` until the user taps through `check()`.

### With a custom confirm dialog

```tsx
const { check, checking } = useUpdater({
  onConfirm: async (manifest) => {
    // return true to proceed with reload, false to cancel
    return myCustomDialog(manifest)
  },
})
```

### With custom info alerts

```tsx
const { check, checking } = useUpdater({
  onInfo: (title, message) => myInfoDialog(title, message),
})
```

Covers `check()`'s three purely-informational cases - dev-mode disabled, web unsupported, and "you're already up to date" - none of which need a confirm/cancel choice, just something to acknowledge. Defaults to `Alert.alert` like `onError`.

### Disable automatic mount/foreground checks entirely

```tsx
const { check, checking } = useUpdater({ autoCheck: false })
```

Fully manual - no mount-time fetch, no `AppState` listener, `check()` always fetches fresh. `autoPrompt` is irrelevant here.

### Silent background staging only (no auto-prompt)

```tsx
const { check, checking, updateReady } = useUpdater({ autoPrompt: false })
```

Mount and foreground fetches still run and stage the update (`updateReady` flips `true`), but the confirm dialog only shows up via a manual `check()` - same as the settings-screen example above. Good for games or anything where you don't want a dialog interrupting the user.

### Wi-Fi only

```json
{
  "expo": {
    "updates": {
      "checkAutomatically": "WIFI_ONLY"
    }
  }
}
```

```tsx
import * as ExpoNetwork from 'expo-network'

const { check, checking, updateReady } = useUpdater({ expoNetwork: ExpoNetwork })
```

With `WIFI_ONLY`, expo-updates only checks at launch on Wi-Fi, and this hook follows suit:

- Launch and foreground checks only fetch on Wi-Fi (Ethernet counts too). Off Wi-Fi they're skipped.
- When Wi-Fi comes back while the app is open, the hook fetches then. It stages the update without prompting, since that moment can land in the middle of whatever the user is doing. The next foreground shows the prompt, even off Wi-Fi, since the update is already downloaded.
- A manual `check()` always fetches, on any network: the user asked for it.

The hook needs `expoNetwork` to tell Wi-Fi from cellular. Without it, a `WIFI_ONLY` app gets no automatic checks from this hook at all, only expo-updates' own launch check. `expoNetwork` is ignored under any other setting.

`NEVER` and `ON_ERROR_RECOVERY` turn this hook's automatic checks off too, as `autoCheck: false` does, and leave `check()` working. `ON_LOAD` (the default) keeps them on every network.

`checkAutomatically` is native config (written into `Expo.plist` and `AndroidManifest.xml` at build time), so changing it takes a new build, not an OTA update.

### Restarting behind the splash

When the user says yes, the app restarts into the update, and expo-updates covers it while the new code loads. By default that cover is a white screen with a spinner, on iOS and Android alike, whatever the app looks like. This hook gives it the app's splash instead:

- **The color** comes from app.json by itself: the `expo-splash-screen` plugin's `backgroundColor`, or its `dark.backgroundColor` in dark mode. Every app with that plugin gets it with no code.
- **The art** has to be handed over once, because the plugin's own copies are native resources JS can't reach. Pass the same image(s) app.json gives the plugin, next to your `SplashScreen.preventAutoHideAsync()`:

```tsx
import { setReloadSplash } from '@rific/updater'

setReloadSplash({ image: require('./assets/images/splash-icon.png') })
// or, with a different dark image:
setReloadSplash({ image: require('./assets/images/splash-light.png'), darkImage: require('./assets/images/splash-dark.png') })
```

The art is drawn at the plugin's `imageWidth` (100 when app.json gives none) and its own aspect, centered, with no spinner, so it looks like the splash. The plugin's `ios` and `android` overrides apply on their platform, as the plugin applies them. Without `setReloadSplash` the screen is the splash color with a spinner in black or white, whichever reads on it. Art that won't load falls back to that too: the reload never waits on or fails over its cover.

**It isn't the splash itself, and it lifts early.** No API shows the real splash again. expo-updates takes its cover down as soon as the new code has loaded on Android, and when the first content appears on iOS, so the app's own background shows for a moment while the first screen draws (its splash gates don't apply: the splash already hid in this launch). Its calls to keep the cover up longer only work in debug builds. Give Android a window color in app.json (`android.backgroundColor`, the splash color is a good choice) so that moment isn't white either.

This is all JavaScript: it ships in an OTA update to existing builds.

---

## API

### `useUpdater(options?)`

```ts
interface UseUpdaterOptions {
  autoCheck?: boolean                                    // default: true
  autoPrompt?: boolean                                   // default: true
  expoNetwork?: ExpoNetworkModule                        // import * as ExpoNetwork from 'expo-network'
  onConfirm?: (manifest: UpdateManifest) => Promise<boolean>
  onError?: (message: string) => void
  onInfo?: (title: string, message: string) => void
}

interface UseUpdaterReturn {
  check: () => Promise<void>
  checking: boolean
  updateReady: boolean
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `autoCheck` | `true` | Fetches available updates once on mount and again via an `AppState` listener whenever the app comes to the foreground. Disable for apps that want full manual control. Also follows the app's `updates.checkAutomatically`: off under `NEVER` and `ON_ERROR_RECOVERY`, Wi-Fi only under `WIFI_ONLY` (see [Wi-Fi only](#wi-fi-only)). |
| `autoPrompt` | `true` | When a mount or foreground `autoCheck` fetch finds an update, run the confirmation dialog (and reload on confirm) immediately. Set `false` to fall back to the old behavior - silently stage it for a manual `check()` or the next cold launch instead. Ignored if `autoCheck` is `false`. A manual `check()` call and an auto-prompt won't run concurrently - whichever is in flight blocks the other. |
| `expoNetwork` | - | The `expo-network` module, for apps whose `checkAutomatically` is `WIFI_ONLY`: automatic checks then only fetch on Wi-Fi, and fetch again (staging, no prompt) when Wi-Fi comes back. Without it those apps get no automatic checks from this hook. Ignored under any other setting. |
| `onConfirm` | - | Custom confirmation dialog. Receives the update manifest, must return `Promise<boolean>` - `true` to reload, `false` to cancel. Defaults to a native `Alert` showing the release date. |
| `onError` | - | Called with an error message string if `check()` throws. Defaults to `Alert.alert`. |
| `onInfo` | - | Called with `(title, message)` for `check()`'s purely-informational cases (dev-mode disabled, web unsupported, no update found) - no confirm/cancel choice, just an acknowledgeable message. Defaults to `Alert.alert`. |

| Return | Description |
|--------|-------------|
| `check()` | Manual update check. Shows a dev/web guard alert if unsupported. If a background fetch already staged an update (`autoPrompt: false`), uses that manifest directly (no extra network call). Clears `updateReady` on completion regardless of whether the user confirmed. |
| `checking` | `true` while `check()` - or an `autoPrompt` auto-prompt - is in flight. Safe to drive a loading spinner. Concurrent calls are ignored via a ref guard. |
| `updateReady` | `true` once a fetch has staged an update. With the default `autoPrompt: true` this is transient (cleared as soon as the dialog resolves); with `autoPrompt: false` it persists until `check()` runs, so it's the useful signal for a settings badge there. |


### `setReloadSplash(splash)`

```ts
setReloadSplash({ image: number, darkImage?: number } | null)
```

The splash art for the cover expo-updates shows while an update restarts the app (see [Restarting behind the splash](#restarting-behind-the-splash)). Module-wide: it covers every `useUpdater` instance in the app, including ones inside other packages (@tastic/hud's update dialog and Settings row). `null` goes back to the color alone.

---

## How updates work

**Automatic (mount + foreground):** When `autoCheck` is `true`, the hook fetches once on mount (covering cold launch) and also registers an `AppState` listener that re-fetches each time the app returns from background/inactive to active. Both paths call `checkForUpdateAsync()` + `fetchUpdateAsync()` and share the same confirm/reload flow. By default (`autoPrompt: true`) a found update goes straight into the confirmation dialog and `reloadAsync()` on confirm, behind the app's splash (see [Restarting behind the splash](#restarting-behind-the-splash)) - no tap required. With `autoPrompt: false`, the downloaded bundle just sits on disk instead - no prompt, no restart - until a manual `check()` is called. Both paths follow the app's `updates.checkAutomatically` the way expo-updates' own launch check does (see [Wi-Fi only](#wi-fi-only)).

**Manual (`check()`):** Runs the full flow - check (or reuse staged manifest) → confirmation dialog → `reloadAsync()`. The user sees what was released and chooses whether to restart now.

**Web / DEV:** Both are no-ops. `check()` shows an informational alert explaining why. The foreground listener is never registered, and expo-updates itself is never loaded there: the hook imports it the first time a check or reload runs. (Loading it adds a listener to its web module on `globalThis.expo` that it never removes, and Expo's web dev server keeps that global while it renders every page, so a copy of the app per page load stayed in memory until the server ran out.)

---

## Builds and OTA updates

This package is only the update hook. It used to ship `rific-updater-build`, `rific-updater-update` and
`rific-bump-ota` bins; 0.7.0 removed them. Build and publish with EAS directly (`eas build`,
`eas update`), and bump your app's own OTA version constant, if it shows one, in the commit you
publish.

---

## Context / design notes

- Named `@rific/updater` (not `expo-updater`) to avoid confusion with the `expo-updates` peer dependency
- `check()` uses a ref guard (`checkingRef`) rather than the `checking` state to prevent concurrent calls - state batching means a second call could see stale `false` before the first render commits
- `autoPrompt`'s foreground flow shares that same `checkingRef` guard with `check()`, so a manual check and an auto-prompt can't both be mid-confirm at once
- `updateReady` and the staged manifest ref are cleared in `finally` so they reset on both confirm and cancel
- `onConfirm` replaces the default `Alert` entirely - useful in apps that have their own dialog primitive (e.g. a `select()` utility or bottom sheet)
- `onInfo` is the same idea for `check()`'s three non-choice messages (dev-mode disabled, web unsupported, no update found) - separate from `onConfirm` because there's nothing to confirm, just something to show
- No Provider or context required - the hook is self-contained
- `expoNetwork` is passed in rather than imported, and typed by a local copy of the two calls it makes (`ExpoNetworkModule`), so apps that never use `WIFI_ONLY` don't need `expo-network` installed
- The check that runs when Wi-Fi comes back stages without prompting: unlike a launch or a foreground, it can fire mid-task (a game in progress), and a staged update gets its prompt at the next foreground without another download

---

## Consuming apps

> **0.3.0 changed the default:** `autoPrompt` now defaults to `true`, so a bare `useUpdater()` prompts on its own the moment a foreground fetch finds something - it no longer just stages silently for next launch. Every app below was written against the old silent-by-default behavior; pass `autoPrompt: false` explicitly if that's still what you want (this is what Lumber's and Utility's manual-check hooks already do via `autoCheck: false`, so they're unaffected - it's the bare root-layout `useUpdater()` calls and the games that actually change behavior on upgrade).
>
> **0.3.2 added a mount-time check:** `autoCheck` now also fetches once on mount, in addition to the existing foreground `AppState` listener - covering cold launch, which previously only got an update via native `expo-updates` (`checkAutomatically`), silently and outside this hook's confirm/reload flow. Any app with a bare root-layout `useUpdater()` (default `autoPrompt: true`) will now show the confirm dialog on cold launch too, not just on foreground return.

- **Lumber** (`../Lumber`): account screen, shows version + update badge. Root layout's bare `useUpdater()` will start auto-prompting on upgrade unless changed.
- **Utility** (`../Utility`): settings modal, uses `@rific/toaster` for `onError`. Same root-layout caveat as Lumber.
- **Swirlio** (`../Swirlio`): top sheet; now just relies on the `autoPrompt` default rather than passing it explicitly.
- Games (Setter, Hangman, Crumby, HexFleet, etc.) - call `useUpdater()` with no options, relying on the old silent-only default. Will start prompting on cold launch and on foreground return (not during active play - the listener only fires on a background→active transition) unless given `autoPrompt: false`.

### Local development (yalc)

```sh
# in this repo
yalc publish

# in the consuming app
yalc add @rific/updater
```

Use `yalc` not `npm link` - Metro doesn't resolve symlinks reliably.

---

Made by [Infinite Token](https://www.infinitetoken.com), the team behind [Lumber](https://lumber.infinitetoken.com): end-to-end encrypted logging.

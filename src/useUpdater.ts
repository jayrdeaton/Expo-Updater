import { checkAutomatically, reloadAsync } from 'expo-updates'
import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, AppStateStatus, Platform } from 'react-native'

import { checkForUpdate } from './checkForUpdate'
import { getUpdateConfirmation } from './getUpdateConfirmation'
import { type ExpoNetworkModule, isUnmetered } from './network'
import { reloadScreenOptions } from './reloadSplash'
import { UpdateManifest } from './types'

export interface UseUpdaterOptions {
  autoCheck?: boolean
  autoPrompt?: boolean
  // `import * as ExpoNetwork from 'expo-network'`. Only read when the app's `updates.checkAutomatically`
  // is WIFI_ONLY: the auto-check then fetches only on Wi-Fi, and again when Wi-Fi comes back. Omit it
  // there and this hook makes no auto-checks at all, leaving expo-updates' own Wi-Fi-only launch check.
  expoNetwork?: ExpoNetworkModule
  onConfirm?: (manifest: UpdateManifest) => Promise<boolean>
  onError?: (message: string) => void
  // Purely informational - no confirm/cancel choice, just something to acknowledge. Covers the
  // three plain Alert.alert calls inside check() below (dev-mode disabled, web unsupported, and
  // "you're already up to date") - none of them go through onConfirm, since there's no decision
  // to make.
  onInfo?: (title: string, message: string) => void
}

export interface UseUpdaterReturn {
  check: () => Promise<void>
  checking: boolean
  updateReady: boolean
}

const isUnsupported = () => __DEV__ || Platform.OS === 'web'

// Restarts into the downloaded update behind the app's splash (reloadSplash.ts), not expo-updates' white
// loading screen.
const reload = async () => reloadAsync({ reloadScreenOptions: await reloadScreenOptions() })

export const useUpdater = (options: UseUpdaterOptions = {}): UseUpdaterReturn => {
  const { autoCheck = true, autoPrompt = true, expoNetwork, onConfirm, onError, onInfo } = options
  const [checking, setChecking] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const checkingRef = useRef(false)
  const autoCheckPendingRef = useRef(false)
  const appState = useRef(AppState.currentState)
  const stagedManifest = useRef<UpdateManifest | null>(null)
  // Read via refs inside the AppState listener so onConfirm/onError identity changes (e.g. an
  // inline arrow function) don't tear down and re-subscribe the listener on every render.
  const onConfirmRef = useRef(onConfirm)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onConfirmRef.current = onConfirm
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (!autoCheck || isUnsupported()) return

    // The app's own app.json `updates.checkAutomatically`, which expo-updates only applies to its
    // native launch check: read here too so one setting covers this hook's checks as well. NEVER and
    // ON_ERROR_RECOVERY leave updates to a manual check(). ON_LOAD, and null (expo-updates
    // disabled), keep the checks on any network.
    const policy: string | null = checkAutomatically
    if (policy === 'NEVER' || policy === 'ON_ERROR_RECOVERY') return
    const wifiOnly = policy === 'WIFI_ONLY'
    if (wifiOnly && !expoNetwork) return
    const network = wifiOnly ? expoNetwork : undefined
    // Last known connection, so a change to Wi-Fi can tell it came from somewhere else. Unknown
    // until the first check reads it.
    let onWifi: boolean | undefined

    const mayFetch = async () => {
      if (!network) return true
      onWifi = isUnmetered(await network.getNetworkStateAsync())
      return onWifi
    }

    // `prompt` is false for a check Wi-Fi coming back starts, which can land in the middle of
    // whatever someone is doing: it only stages the update, and the next foreground shows it.
    const runAutoCheck = (prompt: boolean) => {
      // Guards against overlapping fetches if AppState fires again (e.g. rapid app-switcher
      // transitions) before a prior auto-check has resolved. Independent of checkingRef, which
      // only guards the confirmation prompt and covers manual check() calls too.
      if (autoCheckPendingRef.current) return
      autoCheckPendingRef.current = true

      mayFetch()
        // Off Wi-Fi, or when a fetch finds nothing new, an update an earlier fetch already staged
        // still gets its prompt: showing it costs no data.
        .then(async (allowed) => (allowed ? await checkForUpdate() : null) ?? stagedManifest.current)
        .then(async (manifest) => {
          if (!manifest) return
          stagedManifest.current = manifest
          setUpdateReady(true)
          if (!prompt || checkingRef.current) return

          checkingRef.current = true
          setChecking(true)
          try {
            const confirmFn = onConfirmRef.current ?? getUpdateConfirmation
            const confirmed = await confirmFn(manifest)
            if (confirmed) await reload()
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not check for updates.'
            if (onErrorRef.current) onErrorRef.current(message)
            else Alert.alert('Update error', message)
          } finally {
            stagedManifest.current = null
            setUpdateReady(false)
            checkingRef.current = false
            setChecking(false)
          }
        })
        .catch(() => {})
        .finally(() => {
          autoCheckPendingRef.current = false
        })
    }

    // Cold launch: run the same check+prompt flow as a foreground resume so update
    // discovery is consistent regardless of how the app was started.
    runAutoCheck(autoPrompt)

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (/inactive|background/.test(appState.current) && nextState === 'active') {
        runAutoCheck(autoPrompt)
      }
      appState.current = nextState
    })

    // Fetches what was skipped off Wi-Fi as soon as Wi-Fi is back, rather than waiting for the next
    // foreground. Only from a known non-Wi-Fi connection (a check still reading it covers the
    // rest), and only while the app is open: backgrounded, the foreground check does it.
    const networkSubscription = network?.addNetworkStateListener((state) => {
      const wasOnWifi = onWifi
      onWifi = isUnmetered(state)
      if (onWifi && wasOnWifi === false && AppState.currentState === 'active') runAutoCheck(false)
    })

    return () => {
      subscription.remove()
      networkSubscription?.remove()
    }
  }, [autoCheck, autoPrompt, expoNetwork])

  const check = async (): Promise<void> => {
    if (__DEV__) {
      const message = 'Update checks are disabled in development mode.'
      if (onInfo) onInfo('Updates unavailable', message)
      else Alert.alert('Updates unavailable', message)
      return
    }
    if (Platform.OS === 'web') {
      const message = 'Update checks are not supported on web.'
      if (onInfo) onInfo('Updates unavailable', message)
      else Alert.alert('Updates unavailable', message)
      return
    }
    if (checkingRef.current) return
    checkingRef.current = true
    setChecking(true)
    try {
      const manifest = stagedManifest.current ?? (await checkForUpdate())
      if (!manifest) {
        const message = 'You are on the most recent version.'
        if (onInfo) onInfo('No update', message)
        else Alert.alert('No update', message)
        return
      }
      const confirmFn = onConfirm ?? getUpdateConfirmation
      const confirmed = await confirmFn(manifest)
      if (!confirmed) return
      await reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not check for updates.'
      if (onError) onError(message)
      else Alert.alert('Update error', message)
    } finally {
      stagedManifest.current = null
      setUpdateReady(false)
      checkingRef.current = false
      setChecking(false)
    }
  }

  return { check, checking, updateReady }
}

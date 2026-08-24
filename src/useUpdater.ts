import { reloadAsync } from 'expo-updates'
import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, AppStateStatus, Platform } from 'react-native'

import { checkForUpdate } from './checkForUpdate'
import { getUpdateConfirmation } from './getUpdateConfirmation'
import { UpdateManifest } from './types'

export interface UseUpdaterOptions {
  autoCheck?: boolean
  autoPrompt?: boolean
  onConfirm?: (manifest: UpdateManifest) => Promise<boolean>
  onError?: (message: string) => void
  // Purely informational — no confirm/cancel choice, just something to acknowledge. Covers the
  // three plain Alert.alert calls inside check() below (dev-mode disabled, web unsupported, and
  // "you're already up to date") — none of them go through onConfirm, since there's no decision
  // to make.
  onInfo?: (title: string, message: string) => void
}

export interface UseUpdaterReturn {
  check: () => Promise<void>
  checking: boolean
  updateReady: boolean
}

const isUnsupported = () => __DEV__ || Platform.OS === 'web'

export const useUpdater = (options: UseUpdaterOptions = {}): UseUpdaterReturn => {
  const { autoCheck = true, autoPrompt = true, onConfirm, onError, onInfo } = options
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
  onConfirmRef.current = onConfirm
  onErrorRef.current = onError

  useEffect(() => {
    if (!autoCheck || isUnsupported()) return

    const runAutoCheck = () => {
      // Guards against overlapping fetches if AppState fires again (e.g. rapid app-switcher
      // transitions) before a prior auto-check has resolved. Independent of checkingRef, which
      // only guards the confirmation prompt and covers manual check() calls too.
      if (autoCheckPendingRef.current) return
      autoCheckPendingRef.current = true

      checkForUpdate()
        .then(async (manifest) => {
          if (!manifest) return
          stagedManifest.current = manifest
          setUpdateReady(true)
          if (!autoPrompt || checkingRef.current) return

          checkingRef.current = true
          setChecking(true)
          try {
            const confirmFn = onConfirmRef.current ?? getUpdateConfirmation
            const confirmed = await confirmFn(manifest)
            if (confirmed) await reloadAsync()
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
    runAutoCheck()

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (/inactive|background/.test(appState.current) && nextState === 'active') {
        runAutoCheck()
      }
      appState.current = nextState
    })

    return () => subscription.remove()
  }, [autoCheck, autoPrompt])

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
      await reloadAsync()
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

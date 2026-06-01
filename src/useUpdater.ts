import { reloadAsync } from 'expo-updates'
import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, AppStateStatus, Platform } from 'react-native'

import { checkForUpdate } from './checkForUpdate'
import { getUpdateConfirmation } from './getUpdateConfirmation'
import { UpdateManifest } from './types'

export interface UseUpdaterOptions {
  autoCheck?: boolean
  onConfirm?: (manifest: UpdateManifest) => Promise<boolean>
  onError?: (message: string) => void
}

export interface UseUpdaterReturn {
  check: () => Promise<void>
  checking: boolean
  updateReady: boolean
}

const isUnsupported = () => __DEV__ || Platform.OS === 'web'

export const useUpdater = (options: UseUpdaterOptions = {}): UseUpdaterReturn => {
  const { autoCheck = true, onConfirm, onError } = options
  const [checking, setChecking] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const checkingRef = useRef(false)
  const appState = useRef(AppState.currentState)
  const stagedManifest = useRef<UpdateManifest | null>(null)

  useEffect(() => {
    if (!autoCheck || isUnsupported()) return

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (/inactive|background/.test(appState.current) && nextState === 'active') {
        checkForUpdate()
          .then((manifest) => {
            if (manifest) {
              stagedManifest.current = manifest
              setUpdateReady(true)
            }
          })
          .catch(() => {})
      }
      appState.current = nextState
    })

    return () => subscription.remove()
  }, [autoCheck])

  const check = async (): Promise<void> => {
    if (__DEV__) {
      Alert.alert('Updates unavailable', 'Update checks are disabled in development mode.')
      return
    }
    if (Platform.OS === 'web') {
      Alert.alert('Updates unavailable', 'Update checks are not supported on web.')
      return
    }
    if (checkingRef.current) return
    checkingRef.current = true
    setChecking(true)
    try {
      const manifest = stagedManifest.current ?? (await checkForUpdate())
      if (!manifest) {
        Alert.alert('No update', 'You are on the most recent version.')
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

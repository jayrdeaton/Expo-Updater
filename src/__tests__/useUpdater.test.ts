import { act, renderHook } from '@testing-library/react'
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import { checkForUpdateAsync, fetchUpdateAsync, reloadAsync } from 'expo-updates'
import { Alert, AppState, Platform } from 'react-native'

import { useUpdater } from '../useUpdater'

type GlobalWithDev = { __DEV__: boolean }
const g = global as unknown as GlobalWithDev

type MockAppState = typeof AppState & {
  __setCurrentState: (s: string) => void
  __emit: (s: string) => void
  __clearListeners: () => void
}
const mockAppState = AppState as MockAppState
const alertAlert = Alert.alert as jest.Mock

const mockManifest = {
  createdAt: '2026-01-15T12:00:00.000Z'
}

const setCheckAutomatically = (Updates as unknown as { __setCheckAutomatically: (value: string | null) => void }).__setCheckAutomatically
const setExpoConfig = (Constants as unknown as { __setExpoConfig: (config: { plugins?: unknown[] } | null) => void }).__setExpoConfig

// Stands in for `import * as ExpoNetwork from 'expo-network'`, which the hook takes as an option
// rather than importing, so it's a plain fake here instead of a module mock.
type NetworkListener = (state: { type?: string }) => void
const networkListeners: NetworkListener[] = []
let networkType = 'WIFI'
const expoNetwork = {
  getNetworkStateAsync: jest.fn(async () => ({ type: networkType })),
  addNetworkStateListener: jest.fn((listener: NetworkListener) => {
    networkListeners.push(listener)
    return {
      remove: jest.fn(() => {
        networkListeners.splice(networkListeners.indexOf(listener), 1)
      })
    }
  })
}
const setNetwork = (type: string) => {
  networkType = type
  networkListeners.forEach((listener) => listener({ type }))
}

const updateAvailable = () => {
  ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
  ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
}

const pressCancel = () => {
  alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
    buttons[0].onPress()
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAppState.__clearListeners()
  networkListeners.length = 0
  networkType = 'WIFI'
  setCheckAutomatically('ON_LOAD')
  ;(Platform as { OS: string }).OS = 'ios'
  g.__DEV__ = false
})

describe('useUpdater', () => {
  describe('check', () => {
    it('shows dev alert when __DEV__ is true', async () => {
      g.__DEV__ = true
      const { result } = renderHook(() => useUpdater())
      await act(() => result.current.check())
      expect(alertAlert).toHaveBeenCalledWith('Updates unavailable', expect.stringContaining('development'))
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
    })

    it('shows web alert when Platform.OS is web', async () => {
      ;(Platform as { OS: string }).OS = 'web'
      const { result } = renderHook(() => useUpdater())
      await act(() => result.current.check())
      expect(alertAlert).toHaveBeenCalledWith('Updates unavailable', expect.stringContaining('web'))
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
    })

    it('shows no-update alert when no update available', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
      const { result } = renderHook(() => useUpdater())
      await act(() => result.current.check())
      expect(alertAlert).toHaveBeenCalledWith('No update', 'You are on the most recent version.')
    })

    it('calls onInfo instead of the default Alert in dev mode', async () => {
      g.__DEV__ = true
      const onInfo = jest.fn()
      const { result } = renderHook(() => useUpdater({ onInfo }))
      await act(() => result.current.check())
      expect(onInfo).toHaveBeenCalledWith('Updates unavailable', expect.stringContaining('development'))
      expect(alertAlert).not.toHaveBeenCalled()
    })

    it('calls onInfo instead of the default Alert on web', async () => {
      ;(Platform as { OS: string }).OS = 'web'
      const onInfo = jest.fn()
      const { result } = renderHook(() => useUpdater({ onInfo }))
      await act(() => result.current.check())
      expect(onInfo).toHaveBeenCalledWith('Updates unavailable', expect.stringContaining('web'))
      expect(alertAlert).not.toHaveBeenCalled()
    })

    it('calls onInfo instead of the default Alert when no update is available', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
      const onInfo = jest.fn()
      const { result } = renderHook(() => useUpdater({ onInfo }))
      await act(() => result.current.check())
      expect(onInfo).toHaveBeenCalledWith('No update', 'You are on the most recent version.')
      expect(alertAlert).not.toHaveBeenCalled()
    })

    it('shows confirmation dialog with manifest info when update is available', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[0].onPress()
      })
      const { result } = renderHook(() => useUpdater())
      await act(() => result.current.check())
      expect(alertAlert).toHaveBeenCalledWith('Update available', expect.stringContaining('Restart app to update'), expect.any(Array))
    })

    it('calls reloadAsync when user confirms', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      ;(reloadAsync as jest.Mock).mockResolvedValue(undefined)
      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[1].onPress()
      })
      const { result } = renderHook(() => useUpdater())
      await act(() => result.current.check())
      expect(reloadAsync).toHaveBeenCalled()
    })

    it("restarts behind the app's splash, not expo-updates' white screen", async () => {
      setExpoConfig({ plugins: [['expo-splash-screen', { backgroundColor: '#050505' }]] })
      updateAvailable()
      ;(reloadAsync as jest.Mock).mockResolvedValue(undefined)
      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[1].onPress()
      })
      const { result } = renderHook(() => useUpdater({ autoCheck: false }))
      await act(() => result.current.check())
      expect(reloadAsync).toHaveBeenCalledWith({ reloadScreenOptions: { backgroundColor: '#050505', fade: true, spinner: { color: '#FFFFFF' } } })
      setExpoConfig(null)
    })

    it('does not reload when user cancels', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[0].onPress()
      })
      const { result } = renderHook(() => useUpdater())
      await act(() => result.current.check())
      expect(reloadAsync).not.toHaveBeenCalled()
    })

    it('uses staged manifest without network call when updateReady', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      mockAppState.__setCurrentState('background')
      // autoPrompt: false - this test is about check() reusing a manifest a prior silent
      // foreground fetch staged, which only sits around waiting for reuse when autoPrompt isn't
      // already consuming it immediately.
      const { result } = renderHook(() => useUpdater({ autoPrompt: false }))
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(result.current.updateReady).toBe(true)

      jest.clearAllMocks()
      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[0].onPress()
      })
      await act(() => result.current.check())
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
      expect(alertAlert).toHaveBeenCalledWith('Update available', expect.any(String), expect.any(Array))
    })

    it('clears updateReady after check completes', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      mockAppState.__setCurrentState('background')
      const { result } = renderHook(() => useUpdater({ autoPrompt: false }))
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(result.current.updateReady).toBe(true)

      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[0].onPress()
      })
      await act(() => result.current.check())
      expect(result.current.updateReady).toBe(false)
    })

    it('calls onConfirm instead of default Alert dialog', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      const onConfirm = jest.fn().mockResolvedValue(false)
      const { result } = renderHook(() => useUpdater({ onConfirm }))
      await act(() => result.current.check())
      expect(onConfirm).toHaveBeenCalledWith(mockManifest)
      expect(alertAlert).not.toHaveBeenCalledWith('Update available', expect.any(String), expect.any(Array))
    })

    it('calls onError when check throws', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockRejectedValue(new Error('Network error'))
      const onError = jest.fn()
      const { result } = renderHook(() => useUpdater({ onError }))
      await act(() => result.current.check())
      expect(onError).toHaveBeenCalledWith('Network error')
    })

    it('falls back to Alert when check throws and no onError provided', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockRejectedValue(new Error('Network error'))
      const { result } = renderHook(() => useUpdater())
      await act(() => result.current.check())
      expect(alertAlert).toHaveBeenCalledWith('Update error', 'Network error')
    })

    it('sets checking to true during check and false after', async () => {
      let resolveCheck!: (v: { isAvailable: boolean }) => void
      ;(checkForUpdateAsync as jest.Mock).mockReturnValue(new Promise((res) => (resolveCheck = res)))
      const { result } = renderHook(() => useUpdater())
      act(() => {
        result.current.check()
      })
      expect(result.current.checking).toBe(true)
      await act(() => {
        resolveCheck({ isAvailable: false })
      })
      expect(result.current.checking).toBe(false)
    })

    it('ignores concurrent calls while checking', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
      const { result } = renderHook(() => useUpdater())
      await act(async () => {})
      jest.clearAllMocks()
      await act(async () => {
        result.current.check()
        result.current.check()
        result.current.check()
      })
      expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
    })
  })

  describe('mount check', () => {
    it('fetches and auto-prompts on mount when an update is available', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[0].onPress()
      })
      renderHook(() => useUpdater())
      await act(async () => {})
      expect(checkForUpdateAsync).toHaveBeenCalled()
      expect(alertAlert).toHaveBeenCalledWith('Update available', expect.stringContaining('Restart app to update'), expect.any(Array))
    })

    it('reloads when the user confirms the mount-time prompt', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      ;(reloadAsync as jest.Mock).mockResolvedValue(undefined)
      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[1].onPress()
      })
      renderHook(() => useUpdater())
      await act(async () => {})
      expect(reloadAsync).toHaveBeenCalled()
    })

    it("restarts behind the app's splash from the mount-time prompt too", async () => {
      setExpoConfig({ plugins: [['expo-splash-screen', { backgroundColor: '#050505' }]] })
      updateAvailable()
      ;(reloadAsync as jest.Mock).mockResolvedValue(undefined)
      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[1].onPress()
      })
      renderHook(() => useUpdater())
      await act(async () => {})
      expect(reloadAsync).toHaveBeenCalledWith({ reloadScreenOptions: { backgroundColor: '#050505', fade: true, spinner: { color: '#FFFFFF' } } })
      setExpoConfig(null)
    })

    it('stages silently without prompting on mount when autoPrompt is false', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      const { result } = renderHook(() => useUpdater({ autoPrompt: false }))
      await act(async () => {})
      expect(result.current.updateReady).toBe(true)
      expect(alertAlert).not.toHaveBeenCalled()
    })

    it('does not set updateReady when no update found on mount', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
      const { result } = renderHook(() => useUpdater())
      await act(async () => {})
      expect(result.current.updateReady).toBe(false)
      expect(alertAlert).not.toHaveBeenCalled()
    })

    it('does not fetch on mount in dev mode', async () => {
      g.__DEV__ = true
      renderHook(() => useUpdater())
      await act(async () => {})
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
    })

    it('does not fetch on mount on web', async () => {
      ;(Platform as { OS: string }).OS = 'web'
      renderHook(() => useUpdater())
      await act(async () => {})
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
    })

    it('does not fetch on mount when autoCheck is false', async () => {
      renderHook(() => useUpdater({ autoCheck: false }))
      await act(async () => {})
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
    })
  })

  describe('foreground check', () => {
    it('silently fetches and sets updateReady when app comes to foreground (autoPrompt off)', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      mockAppState.__setCurrentState('background')
      const { result, unmount } = renderHook(() => useUpdater({ autoPrompt: false }))
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(checkForUpdateAsync).toHaveBeenCalled()
      expect(result.current.updateReady).toBe(true)
      expect(alertAlert).not.toHaveBeenCalled()
      unmount()
    })

    it('does not set updateReady when no update found on foreground', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
      mockAppState.__setCurrentState('background')
      const { result, unmount } = renderHook(() => useUpdater())
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(result.current.updateReady).toBe(false)
      unmount()
    })

    it('does not fetch on foreground in dev mode', async () => {
      g.__DEV__ = true
      mockAppState.__setCurrentState('background')
      const { unmount } = renderHook(() => useUpdater())
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
      unmount()
    })

    it('does not fetch on foreground on web', async () => {
      ;(Platform as { OS: string }).OS = 'web'
      mockAppState.__setCurrentState('background')
      const { unmount } = renderHook(() => useUpdater())
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
      unmount()
    })

    it('does not register AppState listener when autoCheck is false', () => {
      renderHook(() => useUpdater({ autoCheck: false }))
      expect(AppState.addEventListener).not.toHaveBeenCalled()
    })

    it('removes AppState listener on unmount', async () => {
      const { unmount } = renderHook(() => useUpdater())
      expect(AppState.addEventListener).toHaveBeenCalledTimes(1)
      await act(async () => {})
      jest.clearAllMocks()
      unmount()
      mockAppState.__emit('active')
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
    })
  })

  describe('autoPrompt', () => {
    it('does not show the confirm dialog on foreground when autoPrompt is explicitly false', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      mockAppState.__setCurrentState('background')
      const { result, unmount } = renderHook(() => useUpdater({ autoPrompt: false }))
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(result.current.updateReady).toBe(true)
      expect(alertAlert).not.toHaveBeenCalled()
      expect(reloadAsync).not.toHaveBeenCalled()
      unmount()
    })

    it('shows the confirm dialog automatically on foreground by default (autoPrompt unset)', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      mockAppState.__setCurrentState('background')
      const { unmount } = renderHook(() => useUpdater())
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(alertAlert).toHaveBeenCalledWith('Update available', expect.stringContaining('Restart app to update'), expect.any(Array))
      unmount()
    })

    it('reloads when the user confirms the auto-prompted dialog', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      ;(reloadAsync as jest.Mock).mockResolvedValue(undefined)
      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[1].onPress()
      })
      mockAppState.__setCurrentState('background')
      const { unmount } = renderHook(() => useUpdater({ autoPrompt: true }))
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(reloadAsync).toHaveBeenCalled()
      unmount()
    })

    it('does not reload when the user cancels the auto-prompted dialog', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[0].onPress()
      })
      mockAppState.__setCurrentState('background')
      const { result, unmount } = renderHook(() => useUpdater({ autoPrompt: true }))
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(reloadAsync).not.toHaveBeenCalled()
      expect(result.current.updateReady).toBe(false)
      unmount()
    })

    it('calls onConfirm instead of the default Alert when auto-prompting', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      const onConfirm = jest.fn().mockResolvedValue(false)
      mockAppState.__setCurrentState('background')
      const { unmount } = renderHook(() => useUpdater({ autoPrompt: true, onConfirm }))
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(onConfirm).toHaveBeenCalledWith(mockManifest)
      expect(alertAlert).not.toHaveBeenCalledWith('Update available', expect.any(String), expect.any(Array))
      unmount()
    })

    it('routes errors to onError when auto-prompting throws', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      const onConfirm = jest.fn().mockRejectedValue(new Error('Confirm failed'))
      const onError = jest.fn()
      mockAppState.__setCurrentState('background')
      const { unmount } = renderHook(() => useUpdater({ autoPrompt: true, onConfirm, onError }))
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(onError).toHaveBeenCalledWith('Confirm failed')
      unmount()
    })

    it('sets checking to true while auto-prompting', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      let resolveConfirm!: (v: boolean) => void
      const onConfirm = jest.fn().mockReturnValue(new Promise((res) => (resolveConfirm = res)))
      mockAppState.__setCurrentState('background')
      const { result, unmount } = renderHook(() => useUpdater({ autoPrompt: true, onConfirm }))
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(result.current.checking).toBe(true)
      await act(async () => {
        resolveConfirm(false)
      })
      expect(result.current.checking).toBe(false)
      unmount()
    })

    it('ignores a manual check while an auto-prompt is in flight', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      let resolveConfirm!: (v: boolean) => void
      const onConfirm = jest.fn().mockReturnValue(new Promise((res) => (resolveConfirm = res)))
      mockAppState.__setCurrentState('background')
      const { result, unmount } = renderHook(() => useUpdater({ autoPrompt: true, onConfirm }))
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(result.current.checking).toBe(true)

      jest.clearAllMocks()
      await act(() => result.current.check())
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
      expect(onConfirm).not.toHaveBeenCalled()

      await act(async () => {
        resolveConfirm(false)
      })
      unmount()
    })

    it('does not auto-prompt again while a manual check is in flight', async () => {
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      let resolveCheckFetch!: (v: { isAvailable: boolean }) => void
      ;(checkForUpdateAsync as jest.Mock).mockReturnValue(new Promise((res) => (resolveCheckFetch = res)))
      const { result, unmount } = renderHook(() => useUpdater({ autoPrompt: true }))

      act(() => {
        result.current.check()
      })
      expect(result.current.checking).toBe(true)

      // Let the manual check's fetch resolve so it reaches the (never-resolving, default-mock)
      // confirm dialog - checkingRef stays true throughout since no button gets pressed.
      await act(async () => {
        resolveCheckFetch({ isAvailable: true })
      })
      expect(alertAlert).toHaveBeenCalledTimes(1)
      expect(result.current.checking).toBe(true)

      // A manual check is now genuinely in flight (mid-confirm). A foreground transition still
      // fetches (autoCheck runs independently), but must not open a second, competing prompt.
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      alertAlert.mockClear()
      mockAppState.__setCurrentState('background')
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(alertAlert).not.toHaveBeenCalled()

      unmount()
    })
  })

  describe('checkAutomatically', () => {
    it('makes no auto-checks under NEVER, but a manual check still fetches', async () => {
      setCheckAutomatically('NEVER')
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
      const { result } = renderHook(() => useUpdater())
      await act(async () => {})
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
      expect(AppState.addEventListener).not.toHaveBeenCalled()
      await act(() => result.current.check())
      expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
    })

    it('makes no auto-checks under ON_ERROR_RECOVERY', async () => {
      setCheckAutomatically('ON_ERROR_RECOVERY')
      updateAvailable()
      mockAppState.__setCurrentState('background')
      renderHook(() => useUpdater())
      await act(async () => {
        mockAppState.__emit('active')
      })
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
      expect(alertAlert).not.toHaveBeenCalled()
    })

    it('checks on any network under ON_LOAD without reading the network', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
      networkType = 'CELLULAR'
      renderHook(() => useUpdater({ expoNetwork }))
      await act(async () => {})
      expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
      expect(expoNetwork.getNetworkStateAsync).not.toHaveBeenCalled()
      expect(expoNetwork.addNetworkStateListener).not.toHaveBeenCalled()
    })

    it('treats no setting (expo-updates disabled) like ON_LOAD', async () => {
      setCheckAutomatically(null)
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
      renderHook(() => useUpdater())
      await act(async () => {})
      expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
    })

    describe('WIFI_ONLY', () => {
      beforeEach(() => {
        setCheckAutomatically('WIFI_ONLY')
      })

      it('makes no auto-checks without expoNetwork, but a manual check still fetches', async () => {
        ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
        const { result } = renderHook(() => useUpdater())
        await act(async () => {})
        expect(checkForUpdateAsync).not.toHaveBeenCalled()
        expect(AppState.addEventListener).not.toHaveBeenCalled()
        await act(() => result.current.check())
        expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
      })

      it('fetches and prompts on mount on Wi-Fi', async () => {
        updateAvailable()
        pressCancel()
        renderHook(() => useUpdater({ expoNetwork }))
        await act(async () => {})
        expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
        expect(alertAlert).toHaveBeenCalledWith('Update available', expect.any(String), expect.any(Array))
      })

      it('counts Ethernet as Wi-Fi', async () => {
        ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
        networkType = 'ETHERNET'
        renderHook(() => useUpdater({ expoNetwork }))
        await act(async () => {})
        expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
      })

      it('does not fetch on mount or foreground over cellular', async () => {
        updateAvailable()
        networkType = 'CELLULAR'
        const { result } = renderHook(() => useUpdater({ expoNetwork }))
        await act(async () => {
          mockAppState.__emit('background')
          mockAppState.__emit('active')
        })
        expect(expoNetwork.getNetworkStateAsync).toHaveBeenCalled()
        expect(checkForUpdateAsync).not.toHaveBeenCalled()
        expect(result.current.updateReady).toBe(false)
        expect(alertAlert).not.toHaveBeenCalled()
      })

      it('still fetches on a manual check over cellular', async () => {
        ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
        networkType = 'CELLULAR'
        const { result } = renderHook(() => useUpdater({ expoNetwork }))
        await act(async () => {})
        await act(() => result.current.check())
        expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
        expect(alertAlert).toHaveBeenCalledWith('No update', 'You are on the most recent version.')
      })

      it('fetches and stages without prompting when Wi-Fi comes back while open', async () => {
        updateAvailable()
        networkType = 'CELLULAR'
        const { result } = renderHook(() => useUpdater({ expoNetwork }))
        await act(async () => {})
        expect(checkForUpdateAsync).not.toHaveBeenCalled()

        await act(async () => {
          setNetwork('WIFI')
        })
        expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
        expect(result.current.updateReady).toBe(true)
        expect(alertAlert).not.toHaveBeenCalled()
      })

      it('prompts on the next foreground for an update staged on Wi-Fi, even off Wi-Fi, without fetching again', async () => {
        updateAvailable()
        networkType = 'CELLULAR'
        const { result } = renderHook(() => useUpdater({ expoNetwork }))
        await act(async () => {})
        await act(async () => {
          setNetwork('WIFI')
        })
        expect(result.current.updateReady).toBe(true)

        await act(async () => {
          setNetwork('CELLULAR')
          mockAppState.__emit('background')
        })
        jest.clearAllMocks()
        pressCancel()
        await act(async () => {
          mockAppState.__emit('active')
        })
        expect(checkForUpdateAsync).not.toHaveBeenCalled()
        expect(alertAlert).toHaveBeenCalledWith('Update available', expect.any(String), expect.any(Array))
        expect(result.current.updateReady).toBe(false)
      })

      it('leaves Wi-Fi coming back in the background to the foreground check', async () => {
        ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
        networkType = 'CELLULAR'
        renderHook(() => useUpdater({ expoNetwork }))
        await act(async () => {})
        await act(async () => {
          mockAppState.__emit('background')
          setNetwork('WIFI')
        })
        expect(checkForUpdateAsync).not.toHaveBeenCalled()

        await act(async () => {
          mockAppState.__emit('active')
        })
        expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
      })

      it('does not fetch again when the network reports Wi-Fi it was already on', async () => {
        ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
        renderHook(() => useUpdater({ expoNetwork }))
        await act(async () => {})
        expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)

        await act(async () => {
          setNetwork('WIFI')
        })
        expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
      })

      it('removes the network listener on unmount', async () => {
        ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
        const { unmount } = renderHook(() => useUpdater({ expoNetwork }))
        await act(async () => {})
        expect(networkListeners).toHaveLength(1)
        unmount()
        expect(networkListeners).toHaveLength(0)
      })
    })
  })
})

import { act, renderHook } from '@testing-library/react'

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
  createdAt: '2026-01-15T12:00:00.000Z',
  metadata: { message: 'Bug fixes' }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAppState.__clearListeners()
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

    it('shows confirmation dialog with manifest info when update is available', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      alertAlert.mockImplementationOnce((_title: string, _msg: string, buttons: Array<{ onPress: () => void }>) => {
        buttons[0].onPress()
      })
      const { result } = renderHook(() => useUpdater())
      await act(() => result.current.check())
      expect(alertAlert).toHaveBeenCalledWith('Update available', expect.stringContaining('Bug fixes'), expect.any(Array))
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
      const { result } = renderHook(() => useUpdater())
      await act(async () => { mockAppState.__emit('active') })
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
      const { result } = renderHook(() => useUpdater())
      await act(async () => { mockAppState.__emit('active') })
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
      await act(async () => {
        result.current.check()
        result.current.check()
        result.current.check()
      })
      expect(checkForUpdateAsync).toHaveBeenCalledTimes(1)
    })
  })

  describe('foreground check', () => {
    it('silently fetches and sets updateReady when app comes to foreground', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true })
      ;(fetchUpdateAsync as jest.Mock).mockResolvedValue({ manifest: mockManifest })
      mockAppState.__setCurrentState('background')
      const { result, unmount } = renderHook(() => useUpdater())
      await act(async () => { mockAppState.__emit('active') })
      expect(checkForUpdateAsync).toHaveBeenCalled()
      expect(result.current.updateReady).toBe(true)
      expect(alertAlert).not.toHaveBeenCalled()
      unmount()
    })

    it('does not set updateReady when no update found on foreground', async () => {
      ;(checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false })
      mockAppState.__setCurrentState('background')
      const { result, unmount } = renderHook(() => useUpdater())
      await act(async () => { mockAppState.__emit('active') })
      expect(result.current.updateReady).toBe(false)
      unmount()
    })

    it('does not fetch on foreground in dev mode', async () => {
      g.__DEV__ = true
      mockAppState.__setCurrentState('background')
      const { unmount } = renderHook(() => useUpdater())
      await act(async () => { mockAppState.__emit('active') })
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
      unmount()
    })

    it('does not fetch on foreground on web', async () => {
      ;(Platform as { OS: string }).OS = 'web'
      mockAppState.__setCurrentState('background')
      const { unmount } = renderHook(() => useUpdater())
      await act(async () => { mockAppState.__emit('active') })
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
      unmount()
    })

    it('does not register AppState listener when autoCheck is false', () => {
      renderHook(() => useUpdater({ autoCheck: false }))
      expect(AppState.addEventListener).not.toHaveBeenCalled()
    })

    it('removes AppState listener on unmount', () => {
      const { unmount } = renderHook(() => useUpdater())
      expect(AppState.addEventListener).toHaveBeenCalledTimes(1)
      unmount()
      mockAppState.__emit('active')
      expect(checkForUpdateAsync).not.toHaveBeenCalled()
    })
  })
})

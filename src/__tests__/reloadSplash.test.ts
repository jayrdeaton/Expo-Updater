import * as ExpoAsset from 'expo-asset'
import { Asset } from 'expo-asset'
import Constants from 'expo-constants'
import { Appearance, Platform } from 'react-native'

import { reloadScreenOptions, setReloadSplash, spinnerColorOn } from '../reloadSplash'

const setExpoConfig = (Constants as unknown as { __setExpoConfig: (config: { plugins?: unknown[] } | null) => void }).__setExpoConfig
const setColorScheme = (Appearance as unknown as { __setColorScheme: (scheme: 'light' | 'dark' | null) => void }).__setColorScheme
const setAsset = (ExpoAsset as unknown as { __setAsset: (asset: object) => void }).__setAsset
const fromModule = Asset.fromModule as jest.Mock

// CardTastic's app.json: a felt splash in each mode, the art 200 wide
const SPLASH_PLUGIN = ['expo-splash-screen', { image: './assets/images/splash-light.png', imageWidth: 200, backgroundColor: '#1E5C47', dark: { image: './assets/images/splash-dark.png', backgroundColor: '#123F30' } }]
const LIGHT_IMAGE = 11
const DARK_IMAGE = 12

beforeEach(() => {
  jest.clearAllMocks()
  setExpoConfig({ plugins: ['expo-router', SPLASH_PLUGIN, 'expo-font'] })
  setColorScheme('light')
  setAsset({})
  setReloadSplash(null)
})

describe('reloadScreenOptions', () => {
  it('leaves expo-updates its own screen when app.json has no splash plugin', async () => {
    setExpoConfig({ plugins: ['expo-router'] })
    expect(await reloadScreenOptions()).toBeUndefined()
    setExpoConfig(null)
    expect(await reloadScreenOptions()).toBeUndefined()
  })

  it("takes the splash's background color, with a spinner that reads on it, before any art is set", async () => {
    expect(await reloadScreenOptions()).toEqual({ backgroundColor: '#1E5C47', fade: true, spinner: { color: '#FFFFFF' } })
  })

  it("takes the dark splash's color in dark mode, and the light one when there is no dark one", async () => {
    setColorScheme('dark')
    expect((await reloadScreenOptions())?.backgroundColor).toBe('#123F30')
    setExpoConfig({ plugins: [['expo-splash-screen', { backgroundColor: '#050505' }]] })
    expect((await reloadScreenOptions())?.backgroundColor).toBe('#050505')
  })

  it("shows the splash art as a cache file, the splash's width and the art's own aspect, with no spinner", async () => {
    setReloadSplash({ image: LIGHT_IMAGE })
    setAsset({ width: 1024, height: 512 })
    const options = await reloadScreenOptions()
    expect(fromModule).toHaveBeenCalledWith(LIGHT_IMAGE)
    expect(options).toEqual({
      backgroundColor: '#1E5C47',
      fade: true,
      image: { url: `file:///cache/ExponentAsset-${LIGHT_IMAGE}.png`, width: 200, height: 100, scale: 1 },
      spinner: { enabled: false, color: '#FFFFFF' }
    })
  })

  it('shows the dark art in dark mode, and the one image in both modes when there is no dark one', async () => {
    setReloadSplash({ image: LIGHT_IMAGE, darkImage: DARK_IMAGE })
    setColorScheme('dark')
    await reloadScreenOptions()
    expect(fromModule).toHaveBeenLastCalledWith(DARK_IMAGE)
    setReloadSplash({ image: LIGHT_IMAGE })
    await reloadScreenOptions()
    expect(fromModule).toHaveBeenLastCalledWith(LIGHT_IMAGE)
  })

  it("uses expo-splash-screen's own 100 width when app.json gives none, and a square when the art has no size", async () => {
    setExpoConfig({ plugins: [['expo-splash-screen', { backgroundColor: '#050505' }]] })
    setReloadSplash({ image: LIGHT_IMAGE })
    setAsset({ width: null, height: null })
    expect((await reloadScreenOptions())?.image).toMatchObject({ width: 100, height: 100 })
  })

  it("takes the plugin's ios or android overrides on that platform, its dark part over the top level's", async () => {
    // DuelTastic's: the art 170 wide on Android; HexFleet's: 320 on iOS
    setExpoConfig({ plugins: [['expo-splash-screen', { imageWidth: 200, backgroundColor: '#FAFAFA', dark: { backgroundColor: '#050505' }, android: { imageWidth: 170, dark: { backgroundColor: '#000000' } }, ios: { imageWidth: 320 } }]] })
    setReloadSplash({ image: LIGHT_IMAGE })
    const platform = Platform as { OS: string }
    const os = platform.OS
    try {
      platform.OS = 'android'
      expect(await reloadScreenOptions()).toMatchObject({ backgroundColor: '#FAFAFA', image: { width: 170 } })
      setColorScheme('dark')
      expect((await reloadScreenOptions())?.backgroundColor).toBe('#000000')
      platform.OS = 'ios'
      expect(await reloadScreenOptions()).toMatchObject({ backgroundColor: '#050505', image: { width: 320 } })
      platform.OS = 'web'
      expect((await reloadScreenOptions())?.image).toMatchObject({ width: 200 })
    } finally {
      platform.OS = os
    }
  })

  it('keeps the color and a spinner when the art will not load', async () => {
    setReloadSplash({ image: LIGHT_IMAGE })
    setAsset({ downloadAsync: jest.fn(async () => Promise.reject(new Error('gone'))) })
    expect(await reloadScreenOptions()).toEqual({ backgroundColor: '#1E5C47', fade: true, spinner: { color: '#FFFFFF' } })
  })
})

describe('spinnerColorOn', () => {
  it('is white on a dark color and black on a light one, short hex included', () => {
    expect(spinnerColorOn('#050505')).toBe('#FFFFFF')
    expect(spinnerColorOn('#FAFAFA')).toBe('#000000')
    expect(spinnerColorOn('#fff')).toBe('#000000')
  })

  it("leaves expo-updates' own color for anything but plain hex", () => {
    expect(spinnerColorOn('rgb(0, 0, 0)')).toBeUndefined()
    expect(spinnerColorOn('#12345678')).toBeUndefined()
  })
})

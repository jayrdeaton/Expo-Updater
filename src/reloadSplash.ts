import { Asset } from 'expo-asset'
import Constants from 'expo-constants'
import type { ReloadScreenOptions } from 'expo-updates'
import { Appearance, Platform } from 'react-native'

// The splash art for the reload screen: the same image (and dark image, if app.json gives one) the app
// hands the expo-splash-screen plugin, as require()s. The plugin's own copies are native resources JS
// can't reach, so the app passes them in once, at startup (setReloadSplash).
export interface ReloadSplash {
  image: number
  darkImage?: number
}

// The expo-splash-screen plugin's options in app.json, the part read here.
interface SplashOptions {
  backgroundColor?: string
  imageWidth?: number
  dark?: { backgroundColor?: string }
}

interface SplashPluginOptions extends SplashOptions {
  ios?: SplashOptions
  android?: SplashOptions
}

// expo-splash-screen's own width when app.json gives no imageWidth (its getAndroidSplashConfig and
// getIosSplashConfig).
const DEFAULT_IMAGE_WIDTH = 100

let splash: ReloadSplash | null = null

// Gives the reload screen the splash art. Call it once, where the app sets up its splash screen. Without
// it the reload screen still takes the splash's background color, with a spinner instead of the art.
export const setReloadSplash = (next: ReloadSplash | null): void => {
  splash = next
}

// The plugin's options as it applies them on this platform: an `ios` or `android` object overrides the
// top level, and its `dark` the top level's (the plugin's getIosSplashConfig/getAndroidSplashConfig), so
// an app whose splash art is smaller on Android gets the smaller art here too.
const splashPluginOptions = (): SplashOptions | null => {
  for (const plugin of Constants.expoConfig?.plugins ?? []) {
    if (!Array.isArray(plugin) || plugin[0] !== 'expo-splash-screen') continue
    const { ios, android, ...rest } = (plugin[1] ?? {}) as SplashPluginOptions
    const platform = (Platform.OS === 'ios' ? ios : Platform.OS === 'android' ? android : undefined) ?? {}
    return { ...rest, ...platform, dark: { ...rest.dark, ...platform.dark } }
  }
  return null
}

// Black or white, whichever reads on the background (the spinner's color). Undefined for a color that
// isn't plain hex, which leaves expo-updates' own spinner color.
export const spinnerColorOn = (background: string): string | undefined => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(background)
  if (!match) return undefined
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1]
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.5 ? '#000000' : '#FFFFFF'
}

// The art as a file the native reload screen can load. It only loads http, file and data URLs, and an
// image bundled into an Android build resolves to a resource name, so expo-asset copies it to a cache
// file first (on iOS, and for a bundle that came in an update, it is a file already). Sized like the
// splash: imageWidth wide, its own aspect.
const splashImage = async (module: number, width: number) => {
  const asset = Asset.fromModule(module)
  await asset.downloadAsync()
  const height = asset.width && asset.height ? (width * asset.height) / asset.width : width
  return { url: asset.localUri ?? asset.uri, width, height, scale: 1 }
}

// What expo-updates' reload screen shows while an update restarts the app: the splash, in the color
// scheme the app is in. Without options it shows its own white screen with a spinner. Undefined (that
// default) when app.json has no expo-splash-screen plugin. Never throws: a reload must not fail over its
// loading screen, so art that won't load leaves the color and a spinner.
export const reloadScreenOptions = async (): Promise<ReloadScreenOptions | undefined> => {
  const plugin = splashPluginOptions()
  if (!plugin) return undefined
  const dark = Appearance.getColorScheme() === 'dark'
  const backgroundColor = (dark ? plugin.dark?.backgroundColor : undefined) ?? plugin.backgroundColor
  const color = backgroundColor ? spinnerColorOn(backgroundColor) : undefined
  const options: ReloadScreenOptions = { backgroundColor, fade: true, spinner: { color } }
  const image = splash ? (dark ? (splash.darkImage ?? splash.image) : splash.image) : undefined
  if (image === undefined) return options
  try {
    // A spinner over the splash art would be one thing the splash never shows. It still comes back if
    // the art fails to load (expo-updates' own fallback), in this color.
    return { ...options, image: await splashImage(image, plugin.imageWidth ?? DEFAULT_IMAGE_WIDTH), spinner: { enabled: false, color } }
  } catch {
    return options
  }
}

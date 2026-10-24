// Local mirror of the two expo-network calls the auto-check makes, never
// `typeof import('expo-network')`, so this package doesn't depend on expo-network: an app passes
// `import * as ExpoNetwork from 'expo-network'` itself (the @rific OptionalModule convention).
// NetworkStateType is a string enum ('WIFI', 'CELLULAR', ...), so `type` is read as a plain string.
export type ExpoNetworkState = {
  type?: string
}

export type ExpoNetworkModule = {
  getNetworkStateAsync: () => Promise<ExpoNetworkState>
  addNetworkStateListener: (listener: (state: ExpoNetworkState) => void) => { remove: () => void }
}

// What counts as Wi-Fi for a WIFI_ONLY app. Ethernet too: expo-updates' own launch check asks
// Android whether the network is metered rather than whether it's Wi-Fi, and a wired connection
// isn't.
export const isUnmetered = (state: ExpoNetworkState): boolean => state.type === 'WIFI' || state.type === 'ETHERNET'

import type * as ExpoNetwork from 'expo-network'

import { type ExpoNetworkModule, isUnmetered } from '../network'

// Checked by `npm run typecheck`, not at runtime: an app passes the real module as `expoNetwork`, so
// it has to fit the local mirror, or that call site stops compiling when expo-network changes.
type RealModuleFits = typeof ExpoNetwork extends ExpoNetworkModule ? true : false
const realModuleFits: RealModuleFits = true

describe('network', () => {
  it('mirrors the real expo-network module', () => {
    expect(realModuleFits).toBe(true)
  })

  it('counts Wi-Fi and Ethernet as unmetered', () => {
    expect(isUnmetered({ type: 'WIFI' })).toBe(true)
    expect(isUnmetered({ type: 'ETHERNET' })).toBe(true)
  })

  it('counts cellular, no connection and an unknown one as metered', () => {
    expect(isUnmetered({ type: 'CELLULAR' })).toBe(false)
    expect(isUnmetered({ type: 'NONE' })).toBe(false)
    expect(isUnmetered({ type: 'UNKNOWN' })).toBe(false)
    expect(isUnmetered({})).toBe(false)
  })
})

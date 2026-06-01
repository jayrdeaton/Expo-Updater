import { checkForUpdateAsync, fetchUpdateAsync } from 'expo-updates'

import { UpdateManifest } from './types'

export const checkForUpdate = async (): Promise<UpdateManifest | null> => {
  const { isAvailable } = await checkForUpdateAsync()
  if (!isAvailable) return null
  const { manifest } = await fetchUpdateAsync()
  return manifest ? (manifest as unknown as UpdateManifest) : null
}

import { UpdateManifest } from './types'
import { loadUpdates } from './updates'

export const checkForUpdate = async (): Promise<UpdateManifest | null> => {
  const { checkForUpdateAsync, fetchUpdateAsync } = await loadUpdates()
  const { isAvailable } = await checkForUpdateAsync()
  if (!isAvailable) return null
  const { manifest } = await fetchUpdateAsync()
  return manifest ? (manifest as unknown as UpdateManifest) : null
}

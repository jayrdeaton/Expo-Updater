import { Alert } from 'react-native'

import { UpdateManifest } from './types'

export const getUpdateConfirmation = (manifest: UpdateManifest): Promise<boolean> => {
  const date = new Date(manifest.createdAt)
  let info = `A new update was released on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}.`
  if (manifest.metadata?.message) info += `\n\nMessage: ${manifest.metadata.message}.`
  info += '\n\nRestart app to update.'

  return new Promise((resolve) => {
    Alert.alert('Update available', info, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Restart', onPress: () => resolve(true) }
    ])
  })
}

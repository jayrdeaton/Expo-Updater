import type * as ExpoUpdates from 'expo-updates'

// expo-updates, loaded the first time it's needed: never on web or in development, where the hook does nothing
// (isUnsupported in useUpdater.ts). Importing it at the top of a file loads it everywhere, and as it loads it adds a
// state listener to its native module that it never removes. On web that module is one object on globalThis.expo,
// which Expo's dev server keeps while it runs the server render again for every page, so each page load left a
// whole copy of the app behind it and the server ran out of memory (HexFleet, 2026-11-16).
export const loadUpdates = (): Promise<typeof ExpoUpdates> => import('expo-updates')

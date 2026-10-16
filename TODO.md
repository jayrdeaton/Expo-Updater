# TODO

## React Native 0.88 strict types

Deferred 2026-10-16 so the focus games could ship on Expo SDK 58 the same day: `@infinitetoken/tsconfig` 0.6 resolves React Native 0.88's legacy (pre-strict) types, and React Native removes those after 0.88. Apps type-check this package's source, and under the strict types it fails in 1 place (measured from an SDK 58 app with `customConditions: ["react-native"]` only): `src/useUpdater.ts:92` (TS2345). Mostly ref and event types moving to the strict instance types. Fix and release before the fleet moves past SDK 58 (see TSConfig's TODO.md).

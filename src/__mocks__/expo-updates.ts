export const checkForUpdateAsync = jest.fn()
export const fetchUpdateAsync = jest.fn()
export const reloadAsync = jest.fn()

// The app.json `updates.checkAutomatically` the native module reports. A `let` so tests can change
// it through __setCheckAutomatically and the hook still reads the current value.
export let checkAutomatically: string | null = 'ON_LOAD'

export const __setCheckAutomatically = (value: string | null) => {
  checkAutomatically = value
}

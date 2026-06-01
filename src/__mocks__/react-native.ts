const Alert = {
  alert: jest.fn()
}

const appStateListeners: Array<(state: string) => void> = []
let currentAppState = 'active'

const AppState = {
  get currentState() {
    return currentAppState
  },
  addEventListener: jest.fn((_event: string, handler: (state: string) => void) => {
    appStateListeners.push(handler)
    return {
      remove: jest.fn(() => {
        const idx = appStateListeners.indexOf(handler)
        if (idx !== -1) appStateListeners.splice(idx, 1)
      })
    }
  }),
  __setCurrentState: (state: string) => {
    currentAppState = state
  },
  __emit: (state: string) => {
    currentAppState = state
    appStateListeners.forEach((l) => l(state))
  },
  __clearListeners: () => {
    appStateListeners.length = 0
    currentAppState = 'active'
  }
}

const Platform = {
  OS: 'ios' as string,
  select: (obj: Record<string, unknown>) => obj.ios ?? obj.default
}

export { Alert, AppState, Platform }

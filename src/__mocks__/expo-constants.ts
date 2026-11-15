// Stands in for expo-constants: expoConfig is the app.json the tests set through __setExpoConfig.
type Config = { plugins?: unknown[] } | null

const Constants: { expoConfig: Config; __setExpoConfig: (config: Config) => void } = {
  expoConfig: null,
  __setExpoConfig: (config) => {
    Constants.expoConfig = config
  }
}

export default Constants

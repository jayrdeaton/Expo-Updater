// Stands in for expo-asset: fromModule gives back an asset for a require() number, and downloadAsync
// "copies" it to a cache file. __setAsset changes what the next fromModule returns.
type MockAsset = { uri: string; localUri: string | null; width: number | null; height: number | null; downloadAsync: jest.Mock }

let next: Partial<MockAsset> = {}

export const __setAsset = (asset: Partial<MockAsset>) => {
  next = asset
}

export const Asset = {
  fromModule: jest.fn((module: number) => {
    const asset: MockAsset = {
      uri: `assets_images_splash_${module}`,
      localUri: null,
      width: 1024,
      height: 1024,
      downloadAsync: jest.fn(async () => {
        asset.localUri = `file:///cache/ExponentAsset-${module}.png`
        return asset
      }),
      ...next
    }
    return asset
  })
}

module.exports = require('@infinitetoken/jest-config/react-native')({
  moduleNameMapper: {
    '^react-native$': '<rootDir>/src/__mocks__/react-native.ts',
    '^expo-updates$': '<rootDir>/src/__mocks__/expo-updates.ts'
  }
})

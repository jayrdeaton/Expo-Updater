module.exports = require('@infinitetoken/jest-config/react-native')({
  moduleNameMapper: {
    '^react-native$': '<rootDir>/src/__mocks__/react-native.ts',
    '^expo-updates$': '<rootDir>/src/__mocks__/expo-updates.ts'
  },
  // scripts/lib has its own plain-CJS tests (no ts-jest/jsdom needed there —
  // each test file sets `@jest-environment node` itself), so both the roots
  // and testMatch defaults (src/-only, .ts/.tsx-only) need widening to reach them.
  roots: ['<rootDir>/src', '<rootDir>/scripts'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx', '**/__tests__/**/*.test.cjs']
})

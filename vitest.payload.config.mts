import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { testDatabaseURL } from './tests/helpers/testDatabase'

// Fail before loading suites when isolation is missing. Never silently use .env's database.
testDatabaseURL()

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/payload/**/*.payload.spec.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 60000,
    testTimeout: 60000,
  },
})

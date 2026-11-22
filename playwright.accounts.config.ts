import { defineConfig } from '@playwright/test'
import { testDatabaseURL } from './tests/helpers/testDatabase'

export default defineConfig({
  testDir: './tests/accounts',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3101',
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
  },
  webServer: {
    command: 'pnpm exec next dev --port 3101',
    url: 'http://localhost:3101/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: testDatabaseURL(),
      PAYLOAD_MIGRATING: 'true',
      EVIL_ACCOUNT_BROWSER_TEST: 'true',
    },
  },
})

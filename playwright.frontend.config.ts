import { defineConfig } from '@playwright/test'
import { testDatabaseURL } from './tests/helpers/testDatabase'

export default defineConfig({
  testDir: './tests/frontend',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec next start --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    env: {
      // The homepage now reads Payload at runtime; use only the isolated test DB.
      DATABASE_URL: testDatabaseURL(),
      PAYLOAD_MIGRATING: 'true',
    },
  },
})

import type { Payload } from 'payload'
import { openTestPayload } from '../helpers/testDatabase'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload

describe.skipIf(!process.env.EVIL_TEST_DATABASE_URL)('API on isolated PostgreSQL', () => {
  beforeAll(async () => {
    payload = await openTestPayload()
  }, 60000)

  afterAll(async () => {
    await payload?.destroy()
  }, 60000)

  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
      // Administrative smoke test, not a test of user access rights.
      overrideAccess: true,
    })
    expect(users).toBeDefined()
  })
})

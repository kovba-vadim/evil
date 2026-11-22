import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Payload, RequiredDataFromCollectionSlug } from 'payload'
import type { Player, User } from '../../src/payload-types'
import { openTestPayload } from '../helpers/testDatabase'
let api: Payload,
  id: number,
  admin: User & { collection: 'users' },
  player: Player & { collection: 'players' }
beforeAll(async () => {
  api = await openTestPayload()
  admin = {
    ...(await api.create({
      collection: 'users',
      overrideAccess: true,
      data: { email: `${crypto.randomUUID()}@example.test`, password: crypto.randomUUID() },
    })),
    collection: 'users',
  }
  player = {
    ...(await api.create({
      collection: 'players',
      overrideAccess: true,
      disableVerificationEmail: true,
      data: {
        email: `${crypto.randomUUID()}@example.test`,
        password: crypto.randomUUID(),
        nickname: 'Длительность',
        timeZone: 'server',
        _verified: true,
      },
    })),
    collection: 'players',
  }
})
afterAll(async () => {
  try {
    if (id) await api.delete({ collection: 'events', id, overrideAccess: true })
    if (admin) await api.delete({ collection: 'users', id: admin.id, overrideAccess: true })
    if (player) await api.delete({ collection: 'players', id: player.id, overrideAccess: true })
  } finally {
    await api?.destroy()
  }
})
it('defaults new events to 30, validates positive integers and reserves writes for Users', async () => {
  // Intentionally omit the generated required field to exercise the server default.
  const data = {
    name: 'Длительность',
    slug: `duration-${crypto.randomUUID()}`,
    coins: 0,
    cooldownMinutes: 0,
  } as RequiredDataFromCollectionSlug<'events'>
  const event = await api.create({ collection: 'events', data, overrideAccess: false, user: admin })
  id = event.id
  expect(event.durationMinutes).toBe(30)
  for (const durationMinutes of [0, -1, 1.5, NaN])
    await expect(
      api.update({
        collection: 'events',
        id,
        user: admin,
        overrideAccess: false,
        data: { durationMinutes },
      }),
    ).rejects.toThrow()
  await expect(
    api.update({
      collection: 'events',
      id,
      user: player,
      overrideAccess: false,
      data: { durationMinutes: 1 },
    }),
  ).rejects.toThrow()
  await expect(
    api.update({
      collection: 'events',
      id,
      user: null,
      overrideAccess: false,
      data: { durationMinutes: 1 },
    }),
  ).rejects.toThrow()
  const updated = await api.update({
    collection: 'events',
    id,
    user: admin,
    overrideAccess: false,
    data: { durationMinutes: 17 },
  })
  expect(updated.durationMinutes).toBe(17)
  expect(updated.cooldownMinutes).toBe(0)
  expect(
    (
      await api.update({
        collection: 'events',
        id,
        user: admin,
        overrideAccess: false,
        data: { shortDescription: 'Сохранение без длительности' },
      })
    ).durationMinutes,
  ).toBe(17)
})

import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { openTestPayload } from '../helpers/testDatabase'
import { backfillEventDuration } from '../../scripts/backfill-event-duration'

let api: Payload
const ids: number[] = []
beforeAll(async () => {
  api = await openTestPayload({ nullableEventDuration: true })
})
afterAll(async () => {
  try {
    for (const id of ids) await api.delete({ collection: 'events', id, overrideAccess: true })
  } finally {
    await api?.destroy()
  }
})

it('fills only actual NULLs, preserves every other field and relation, and is repeatable/concurrency safe', async () => {
  for (const durationMinutes of [30, 30, 17]) {
    const doc = await api.create({
      collection: 'events',
      overrideAccess: true,
      data: {
        name: `duration-backfill-${crypto.randomUUID()}`,
        slug: `duration-${crypto.randomUUID()}`,
        coins: 12,
        cooldownMinutes: 77,
        durationMinutes,
      },
    })
    ids.push(doc.id)
  }
  // Simulate old rows on an explicitly isolated nullable test schema only.
  for (const id of ids.slice(0, 2))
    await api.db.updateOne({ collection: 'events', id, data: { durationMinutes: null } })
  const raw = () =>
    api.db.find<{ id: number; durationMinutes: number | null }>({
      collection: 'events',
      where: { id: { in: ids } },
      sort: 'id',
      limit: 100,
    })
  const before = (await raw()).docs
  const check = await backfillEventDuration(api)
  expect(check.updated).toBe(0)
  expect(check.ids).toEqual(expect.arrayContaining(ids.slice(0, 2)))
  expect((await raw()).docs).toEqual(before)
  const applied = await backfillEventDuration(api, true)
  expect(applied.updated).toBe(check.missing)
  expect((await raw()).docs).toEqual(
    before.map((row) => ({ ...row, durationMinutes: row.durationMinutes ?? 30 })),
  )
  expect((await backfillEventDuration(api, true)).updated).toBe(0)
  expect((await raw()).docs.find((row) => row.id === ids[2])?.durationMinutes).toBe(17)
  await api.db.updateOne({ collection: 'events', id: ids[0], data: { durationMinutes: null } })
  const concurrent = await Promise.all([
    backfillEventDuration(api, true),
    backfillEventDuration(api, true),
  ])
  expect(concurrent.reduce((sum, value) => sum + value.updated, 0)).toBe(1)
})

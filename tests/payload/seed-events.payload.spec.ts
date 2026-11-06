import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { EVENT_SCHEDULE, seedEvents } from '../../scripts/seed-events'
import { EVENT_TIMES } from '../../scripts/seed-event-times'
import { slugifyItemName } from '../../src/fields/slugifyItemName'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'

let api: Payload
beforeAll(async () => {
  api = await openTestPayload()
}, 60000)
afterAll(async () => {
  await api?.destroy()
}, 60000)

it('seeds atomically through Payload, preserves content, uses generated slugs and is idempotent', async () => {
  const fixtures = new ModelFixtures(api)
  const createdIDs: number[] = []
  try {
    const times = new Map<string, number>()
    for (const time of EVENT_TIMES.slice(0, -1)) {
      const doc = await fixtures.create('event-times', { time, minutes: 0 })
      times.set(time, doc.id)
    }
    const extra = await fixtures.create('event-times', { time: '05:00', minutes: 0 })
    const resource = await fixtures.create('resources', {
      name: fixtures.name(),
      slug: fixtures.name(),
    })
    const original = await fixtures.create('events', {
      name: EVENT_SCHEDULE[0].name,
      slug: 'manual-ferry-slug',
      coins: 440,
      cooldownMinutes: 360,
      shortDescription: 'Сохранить описание',
      rewards: [{ resource: resource.id, minQuantity: 0, maxQuantity: 2 }],
      launchTimes: [extra.id, times.get('02:25')!],
    })
    const renamed = await fixtures.create('events', {
      name: fixtures.name(),
      slug: slugifyItemName(EVENT_SCHEDULE[1].name),
      coins: 12,
      cooldownMinutes: 34,
    })
    const createSpy = vi.spyOn(api, 'create')
    await expect(seedEvents(api, true)).rejects.toThrow('23:55')
    expect(createSpy).not.toHaveBeenCalled()
    createSpy.mockRestore()
    const last = await fixtures.create('event-times', { time: '23:55', minutes: 0 })
    times.set('23:55', last.id)
    const preview = await seedEvents(api)
    expect(preview).toMatchObject({ newEvents: 12, existingEvents: 2, missingLinks: 110 })

    const create = api.create.bind(api)
    let attempts = 0
    const failing = vi.spyOn(api, 'create').mockImplementation(async (args) => {
      if (++attempts === 2) throw new Error('Test rollback')
      return create(args)
    })
    await expect(seedEvents(api, true)).rejects.toThrow('Test rollback')
    failing.mockRestore()
    expect((await seedEvents(api)).newEvents).toBe(12)
    expect(
      (
        await api.findByID({
          collection: 'events',
          id: original.id,
          depth: 0,
          overrideAccess: true,
        })
      ).launchTimes,
    ).toEqual(original.launchTimes)

    const tracking = vi.spyOn(api, 'create').mockImplementation(async (args) => {
      const doc = await create(args)
      if (args.collection === 'events') createdIDs.push(doc.id as number)
      return doc
    })
    await seedEvents(api, true)
    tracking.mockRestore()
    const repeat = await seedEvents(api, true)
    expect(repeat).toMatchObject({ newEvents: 0, existingEvents: 14, missingLinks: 0 })
    const saved = await api.findByID({
      collection: 'events',
      id: original.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(saved).toMatchObject({
      name: original.name,
      slug: original.slug,
      coins: 440,
      cooldownMinutes: 360,
      shortDescription: original.shortDescription,
      rewards: original.rewards,
    })
    expect(saved.launchTimes).toContain(extra.id)
    expect(saved.launchTimes).toHaveLength(9)
    expect(new Set(saved.launchTimes).size).toBe(9)
    const preserved = await api.findByID({
      collection: 'events',
      id: renamed.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(preserved).toMatchObject({ name: renamed.name, coins: 12, cooldownMinutes: 34 })
    for (const event of EVENT_SCHEDULE.slice(2)) {
      const result = await api.find({
        collection: 'events',
        where: { name: { equals: event.name } },
        depth: 0,
        overrideAccess: true,
      })
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0]).toMatchObject({
        slug: slugifyItemName(event.name),
        coins: 0,
        cooldownMinutes: 0,
        launchTimes: event.times.map((time) => times.get(time)),
      })
      expect(result.docs[0].rewards ?? []).toEqual([])
      expect(result.docs[0].description).toBeFalsy()
    }
  } finally {
    vi.restoreAllMocks()
    for (const id of createdIDs.reverse())
      await api.delete({ collection: 'events', id, overrideAccess: true })
    await fixtures.cleanup()
  }
})

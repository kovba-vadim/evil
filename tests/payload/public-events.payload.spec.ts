import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest'
import type { Payload } from 'payload'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import {
  getPublicEvents,
  getPublicEventDetail,
  eventCatalogOptions,
  parsePublicEventFilters,
} from '../../src/queries/public-events'
let api: Payload
let fixtures: ModelFixtures
const named = () => ({ name: fixtures.name(), slug: fixtures.name() })
describe('public events through Payload', () => {
  beforeAll(async () => {
    api = await openTestPayload()
  }, 60000)
  afterAll(async () => {
    await api.destroy()
  }, 60000)
  beforeEach(() => {
    fixtures = new ModelFixtures(api)
  })
  afterEach(async () => {
    await fixtures.cleanup()
  }, 60000)
  it('uses inclusive combined filtering with all items, manual order and complete pagination', async () => {
    const a = await fixtures.create('resources', named()),
      b = await fixtures.create('resources', named())
    const expected = []
    for (let index = 11; index >= 0; index--)
      expected.push(
        await fixtures.create('events', {
          ...named(),
          _order: `a${String.fromCharCode(65 + index)}`,
          coins: index,
          cooldownMinutes: 5,
          rewards: [
            { resource: a.id, minQuantity: 0, maxQuantity: 3 },
            ...(index % 2 === 0 ? [{ resource: b.id, minQuantity: 1, maxQuantity: 2 }] : []),
          ],
        }),
      )
    const scope = { pageSize: 2, where: { name: { contains: fixtures.prefix } } }
    const all = await getPublicEvents(api, {}, scope)
    expect(all.map((event) => event.id)).toEqual([...expected].reverse().map((event) => event.id))
    const options = eventCatalogOptions(all)
    expect(options).toMatchObject({ minimum: 0, maximum: 11 })
    expect(options.resources).toHaveLength(2)
    const result = await getPublicEvents(
      api,
      { coinsFrom: 2, coinsTo: 8, resources: [a.id, b.id] },
      scope,
    )
    expect(result.map((event) => event.coins)).toEqual([2, 4, 6, 8])
    expect(result[0].rewards[0]).toMatchObject({ minimum: 0, maximum: 3, slug: a.slug })
    expect(result[0]).not.toHaveProperty('description')
    expect(
      await getPublicEvents(api, { coinsFrom: 3, coinsTo: 3, resources: [b.id] }, scope),
    ).toEqual([])
    expect(eventCatalogOptions([])).toEqual({ minimum: 0, maximum: 0, resources: [] })
    expect(eventCatalogOptions([all[3], all[3]])).toMatchObject({ minimum: 3, maximum: 3 })
    expect(await getPublicEventDetail(api, fixtures.name())).toBeNull()
  })
  it('reads all chronological launch times publicly and still rejects anonymous writes', async () => {
    const times = []
    for (const time of ['23:45', '00:15', '12:00']) {
      const existing = await api.find({
        collection: 'event-times',
        where: { time: { equals: time } },
        overrideAccess: false,
        user: null,
      })
      times.push(existing.docs[0] ?? (await fixtures.create('event-times', { time, minutes: 0 })))
    }
    const event = await fixtures.create('events', {
      ...named(),
      coins: 0,
      cooldownMinutes: 90,
      launchTimes: times.map((time) => time.id),
    })
    const detail = (await getPublicEventDetail(api, event.slug))!
    expect(detail.times.map((time) => time.time)).toEqual(['00:15', '12:00', '23:45'])
    expect(detail.cooldownMinutes).toBe(90)
    for (const collection of ['events', 'event-times'] as const) {
      const id = collection === 'events' ? event.id : times[0].id
      await expect(
        api.findByID({ collection, id, overrideAccess: false, user: null }),
      ).resolves.toMatchObject({ id })
      await expect(
        api.create({ collection, data: {} as never, overrideAccess: false, user: null }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        api.update({ collection, id, data: {}, overrideAccess: false, user: null }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        api.delete({ collection, id, overrideAccess: false, user: null }),
      ).rejects.toMatchObject({ status: 403 })
    }
  })
  it('validates the public filter boundary without accepting time or access overrides', () => {
    expect(
      parsePublicEventFilters({
        coinsFrom: 0,
        coinsTo: 10,
        resources: [1, 1],
        overrideAccess: true,
        from: 100,
      }),
    ).toEqual({ coinsFrom: 0, coinsTo: 10, resources: [1] })
    for (const input of [
      null,
      { coinsFrom: -1 },
      { coinsFrom: 10, coinsTo: 0 },
      { resources: ['1'] },
      { resources: [1.2] },
    ])
      expect(() => parsePublicEventFilters(input)).toThrow()
  })
})

import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import type { Payload } from 'payload'
import type { Event } from '../../src/payload-types'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { getPublicSchedule, parseScheduleFilters } from '../../src/queries/public-launches'
let api: Payload, fixtures: ModelFixtures
const named = () => ({ name: fixtures.name(), slug: fixtures.name() })
describe('public schedule only on the isolated database', () => {
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
    vi.restoreAllMocks()
    await fixtures.cleanup()
  }, 60000)
  it('combines ALL rewards and coins with dated launch rows across every transport page', async () => {
    const a = await fixtures.create('resources', named()),
      b = await fixtures.create('resources', named())
    const times = []
    for (const time of ['23:00', '00:00', '01:00', '01:01']) {
      const found = await api.find({
        collection: 'event-times',
        where: { time: { equals: time } },
        overrideAccess: false,
        user: null,
      })
      times.push(found.docs[0] ?? (await fixtures.create('event-times', { time, minutes: 0 })))
    }
    const events: Event[] = []
    for (let index = 0; index < 12; index++)
      events.push(
        await fixtures.create('events', {
          ...named(),
          coins: 10,
          cooldownMinutes: 0,
          launchTimes: times.map((time) => time.id),
          rewards: [
            { resource: a.id, minQuantity: 0, maxQuantity: 3 },
            { resource: b.id, minQuantity: 1, maxQuantity: 2 },
          ],
        }),
      )
    await fixtures.create('events', {
      ...named(),
      coins: 11,
      cooldownMinutes: 0,
      launchTimes: times.map((time) => time.id),
      rewards: [{ resource: a.id, minQuantity: 1, maxQuantity: 2 }],
    })
    const spy = vi.spyOn(api, 'find')
    const result = await getPublicSchedule(
      api,
      {
        zone: 'server',
        from: '23:00',
        to: '01:00',
        coinsFrom: 10,
        coinsTo: 10,
        resources: [a.id, b.id],
      },
      '2026-01-01T18:00:00Z',
      { pageSize: 2, where: { name: { contains: fixtures.prefix } } },
    )
    expect(result.rows).toHaveLength(36)
    expect(new Set(result.rows.map((row) => row.key)).size).toBe(36)
    expect(
      result.rows.filter((row) => row.event.id === events[0].id).map((row) => row.instant),
    ).toEqual(['2026-01-01T20:00:00Z', '2026-01-01T21:00:00Z', '2026-01-01T22:00:00Z'])
    expect(result.rows[0].event.rewards[0].minimum).toBe(0)
    expect(
      spy.mock.calls.every(([query]) => query.overrideAccess === false && query.depth === 0),
    ).toBe(true)
    const empty = await getPublicSchedule(
      api,
      { zone: 'server', coinsFrom: 99 },
      '2026-01-01T18:00:00Z',
      { where: { name: { contains: fixtures.prefix } } },
    )
    expect(empty.rows).toEqual([])
    const invalid = await getPublicSchedule(
      api,
      { zone: 'Europe/Berlin', from: '02:30', to: '04:00' },
      '2026-03-28T22:00:00Z',
      { where: { name: { contains: fixtures.prefix } } },
    )
    expect(invalid.window).toBeNull()
    expect(invalid.notice).toContain('встречается дважды')
    spy.mockRejectedValueOnce(new Error('schedule read failure'))
    await expect(
      getPublicSchedule(api, { zone: 'server' }, '2026-01-01T00:00:00Z'),
    ).rejects.toThrow('schedule read failure')
  })
  it('validates public filters and never accepts a client now or access override', () => {
    expect(
      parseScheduleFilters({
        zone: 'server',
        from: '23:00',
        to: '01:00',
        resources: [1, 1],
        coinsFrom: 0,
        now: '1900-01-01',
        overrideAccess: true,
      }),
    ).toEqual({ zone: 'server', from: '23:00', to: '01:00', resources: [1], coinsFrom: 0 })
    for (const value of [
      null,
      [],
      { zone: 'unknown' },
      { zone: 'server', from: '24:00' },
      { zone: 'server', to: 1 },
      { zone: 'server', coinsFrom: 3, coinsTo: 2 },
      { zone: 'server', resources: ['1'] },
    ])
      expect(() => parseScheduleFilters(value)).toThrow()
  })
})

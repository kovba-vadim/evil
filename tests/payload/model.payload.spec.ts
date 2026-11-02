import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '../../src/payload-types'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { readAll } from '../helpers/eventFilter'
import { findEvents, type EventFilters } from '../../src/queries/findEvents'
import type { Where } from 'payload'

let api: Payload
let fixtures: ModelFixtures
let user: User & { collection: 'users' }
const ids = (docs: { id: number }[]) => docs.map(({ id }) => id).sort((a, b) => a - b)
const named = () => {
  const name = fixtures.name()
  return { name, slug: name }
}
const reader = () => ({ api, user })
// Existing integration scenarios now execute the reusable server function directly.
const filteredEvents = (context: ReturnType<typeof reader>, where: Where, filters?: EventFilters) =>
  findEvents({
    payload: context.api,
    user: context.user,
    overrideAccess: false,
    where,
    filters,
    pageSize: 2,
  })
const resource = () => fixtures.create('resources', named())
const ordinary = () => fixtures.create('ordinary-items', named())
async function time(value: string) {
  const found = await api.find({
    collection: 'event-times',
    where: { time: { equals: value } },
    limit: 1,
    user,
    overrideAccess: false,
  })
  // Do not modify/delete a pre-existing test document with the same unique time.
  return found.docs[0] ?? fixtures.create('event-times', { time: value, minutes: 0 })
}
async function event(times: number[], resources: number[], coins = 0) {
  return fixtures.create('events', {
    ...named(),
    coins,
    cooldownMinutes: 0,
    launchTimes: times,
    rewards: resources.map((resource) => ({ resource, minQuantity: 0, maxQuantity: 1 })),
  })
}
const deniedDelete = async (
  collection:
    'resources' | 'ordinary-items' | 'event-times' | 'equipment-sets' | 'quest-categories',
  id: number,
) => {
  await expect(api.delete({ collection, id, user, overrideAccess: false })).rejects.toMatchObject({
    status: 400,
  })
  await expect(
    api.findByID({ collection, id, user, overrideAccess: false }),
  ).resolves.toMatchObject({ id })
}

beforeAll(async () => {
  api = await openTestPayload()
})
beforeEach(async () => {
  fixtures = new ModelFixtures(api)
  const account = await fixtures.create('users', {
    email: `${fixtures.name()}@example.test`,
    password: crypto.randomUUID(),
  })
  user = { ...account, collection: 'users' }
})
afterEach(async () => {
  await fixtures?.cleanup()
})
afterAll(async () => {
  await api?.destroy()
})

describe('events: combined PostgreSQL queries through Payload', () => {
  async function scenario() {
    const [a, b, c] = await Promise.all([resource(), resource(), resource()])
    const clock = new Map<string, number>()
    for (const value of [
      '00:00',
      '02:00',
      '02:01',
      '07:00',
      '08:00',
      '09:00',
      '09:55',
      '10:00',
      '11:00',
      '22:59',
      '23:00',
      '23:59',
    ]) {
      clock.set(value, (await time(value)).id)
    }
    const at = (...values: string[]) => values.map((value) => clock.get(value)!)
    const lower = await event(at('08:00'), [a.id, b.id], 100)
    const middle = await event(at('09:00', '09:55'), [a.id, b.id], 150)
    const upper = await event(at('10:00'), [a.id, b.id], 200)
    const extra = await event(at('08:00', '09:00', '10:00'), [a.id, b.id], 180)
    const split = await event(at('07:00', '11:00'), [a.id, b.id], 150)
    const onlyA = await event(at('09:00'), [a.id], 150)
    const onlyB = await event(at('09:00'), [b.id], 150)
    const cheap = await event(at('09:55'), [a.id, b.id], 99)
    const expensive = await event(at('09:55'), [a.id, b.id], 201)
    const empty = await event([], [], 0)
    const night = []
    for (const value of ['23:00', '23:59', '00:00', '02:00'])
      night.push(await event(at(value), [a.id, b.id], 150))
    const outsideNight = [
      await event(at('22:59'), [a.id, b.id], 150),
      await event(at('02:01'), [a.id, b.id], 150),
    ]
    return {
      a,
      b,
      c,
      lower,
      middle,
      upper,
      extra,
      split,
      onlyA,
      onlyB,
      cheap,
      expensive,
      empty,
      night,
      outsideNight,
      scope: { slug: { contains: fixtures.prefix } },
      at,
    }
  }

  it('combines inclusive time, ALL rewards and inclusive coins without duplicates or lost pages', async () => {
    const s = await scenario()
    const result = await filteredEvents(reader(), s.scope, {
      from: 480,
      to: 600,
      resources: [s.a.id, s.b.id],
      coinsFrom: 100,
      coinsTo: 200,
    })
    expect(ids(result)).toEqual(ids([s.lower, s.middle, s.upper, s.extra]))
    expect(new Set(ids(result)).size).toBe(result.length)
    // Four matching events and four matching times exceed the helper's page size (2).
    expect(result).toHaveLength(4)
  })

  it('requires one real launch in range rather than mixing bounds from different launches', async () => {
    const s = await scenario()
    const result = await filteredEvents(reader(), s.scope, { from: 480, to: 600 })
    expect(ids(result)).toEqual(
      ids([s.lower, s.middle, s.upper, s.extra, s.onlyA, s.onlyB, s.cheap, s.expensive]),
    )
    expect(ids(result)).not.toContain(s.split.id)
  })

  it('crosses midnight with both endpoints included and all other conditions applied', async () => {
    const s = await scenario()
    expect(
      ids(
        await filteredEvents(reader(), s.scope, {
          from: 1380,
          to: 120,
          resources: [s.a.id, s.b.id],
          coinsFrom: 100,
          coinsTo: 200,
        }),
      ),
    ).toEqual(ids(s.night))
  })

  it('includes possible rewards with minimum zero and requires every selected item', async () => {
    const s = await scenario()
    const result = await filteredEvents(reader(), s.scope, { resources: [s.a.id, s.b.id] })
    expect(ids(result)).toContain(s.middle.id)
    expect(ids(result)).not.toContain(s.onlyA.id)
    expect(ids(result)).not.toContain(s.onlyB.id)
    expect(await filteredEvents(reader(), s.scope, { resources: [s.a.id, s.c.id] })).toEqual([])
  })

  it('handles omitted conditions, zero coins, single money bounds and a range with no times', async () => {
    const s = await scenario()
    const all = await readAll(reader(), 'events', s.scope)
    expect(ids(await filteredEvents(reader(), s.scope))).toEqual(ids(all))
    expect(ids(await filteredEvents(reader(), s.scope, { coinsFrom: 0, coinsTo: 0 }))).toEqual([
      s.empty.id,
    ])
    expect(ids(await filteredEvents(reader(), s.scope, { coinsFrom: 200 }))).toEqual(
      ids([s.upper, s.expensive]),
    )
    expect(ids(await filteredEvents(reader(), s.scope, { coinsTo: 99 }))).toEqual(
      ids([s.cheap, s.empty]),
    )
    expect(await filteredEvents(reader(), s.scope, { from: 181, to: 182 })).toEqual([])
  })
})

describe('reverse queries and deletion guards through Payload', () => {
  it('returns all seven set items with the current default page size of ten', async () => {
    expect(api.collections.clothing.config.admin.pagination?.defaultLimit).toBe(10)
    expect(api.collections.quests.config.admin.pagination?.defaultLimit).toBe(10)
    const set = await fixtures.create('equipment-sets', named())
    const parts = []
    for (let index = 0; index < 7; index++)
      parts.push(await fixtures.create('clothing', { ...named(), equipmentSet: set.id }))
    // No explicit join limit: exercise the actual configured default.
    const doc = await api.findByID({
      collection: 'equipment-sets',
      id: set.id,
      depth: 0,
      user,
      overrideAccess: false,
    })
    expect(
      (doc.parts?.docs ?? [])
        .map((part) => (typeof part === 'number' ? part : part.id))
        .sort((a, b) => a - b),
    ).toEqual(ids(parts))
    expect(doc.parts?.hasNextPage).toBe(false)
    expect(
      ids(await readAll(reader(), 'clothing', { equipmentSet: { equals: set.id } }, 10)),
    ).toEqual(ids(parts))
  })

  it('finds all sources of a custom item and protects each source independently', async () => {
    const item = await resource()
    const e = await event([], [item.id])
    const q = await fixtures.create('quests', {
      ...named(),
      coins: 0,
      rewards: [{ resource: item.id, quantity: 1 }],
    })
    const b = await fixtures.create('bosses', {
      ...named(),
      coins: 0,
      rewards: [{ resource: item.id, quantity: 1 }],
    })
    for (const [collection, expected] of [
      ['events', e.id],
      ['quests', q.id],
      ['bosses', b.id],
    ] as const) {
      expect(
        ids(await readAll(reader(), collection, { 'rewards.resource': { equals: item.id } })),
      ).toEqual([expected])
    }
    await deniedDelete('resources', item.id)
    await api.update({
      collection: 'events',
      id: e.id,
      data: { rewards: [] },
      user,
      overrideAccess: false,
    })
    await deniedDelete('resources', item.id)
    await api.update({
      collection: 'quests',
      id: q.id,
      data: { rewards: [] },
      user,
      overrideAccess: false,
    })
    await deniedDelete('resources', item.id)
    await api.update({
      collection: 'bosses',
      id: b.id,
      data: { rewards: [] },
      user,
      overrideAccess: false,
    })
    await api.delete({ collection: 'resources', id: item.id, user, overrideAccess: false })
    for (const [collection, id] of [
      ['events', e.id],
      ['quests', q.id],
      ['bosses', b.id],
    ] as const) {
      await expect(
        api.findByID({ collection, id, user, overrideAccess: false }),
      ).resolves.toMatchObject({ id })
    }
  })

  it.each(['resources', 'clothing', 'weapons'] as const)(
    'finds both ingredient kinds in %s and protects inactive recipes',
    async (collection) => {
      const custom = await resource()
      const plain = await ordinary()
      const result = await fixtures.create(collection, {
        ...named(),
        craftable: true,
        recipe: {
          coins: 0,
          resourceIngredients: [{ resource: custom.id, quantity: 2 }],
          ordinaryIngredients: [{ item: plain.id, quantity: 3 }],
        },
      })
      for (const [path, id] of [
        ['recipe.resourceIngredients.resource', custom.id],
        ['recipe.ordinaryIngredients.item', plain.id],
      ] as const) {
        expect(ids(await readAll(reader(), collection, { [path]: { equals: id } }))).toEqual([
          result.id,
        ])
      }
      await deniedDelete('resources', custom.id)
      await deniedDelete('ordinary-items', plain.id)
      await api.update({
        collection,
        id: result.id,
        data: { craftable: false },
        user,
        overrideAccess: false,
      })
      await deniedDelete('resources', custom.id)
      await deniedDelete('ordinary-items', plain.id)
      await api.update({
        collection,
        id: result.id,
        data: { recipe: { resourceIngredients: [], ordinaryIngredients: [], coins: 0 } },
        user,
        overrideAccess: false,
      })
      await api.delete({ collection: 'resources', id: custom.id, user, overrideAccess: false })
      await api.delete({ collection: 'ordinary-items', id: plain.id, user, overrideAccess: false })
      await expect(
        api.findByID({ collection, id: result.id, user, overrideAccess: false }),
      ).resolves.toMatchObject({ id: result.id })
    },
  )

  it('paginates set reverse queries, reads the full join and reflects moving a part', async () => {
    const set = await fixtures.create('equipment-sets', named())
    const other = await fixtures.create('equipment-sets', named())
    const parts = []
    for (let index = 0; index < 5; index++)
      parts.push(await fixtures.create('clothing', { ...named(), equipmentSet: set.id }))
    expect(ids(await readAll(reader(), 'clothing', { equipmentSet: { equals: set.id } }))).toEqual(
      ids(parts),
    )
    const full = await api.findByID({
      collection: 'equipment-sets',
      id: set.id,
      depth: 0,
      joins: { parts: { limit: 0, sort: 'id' } },
      user,
      overrideAccess: false,
    })
    expect(
      (full.parts?.docs ?? []).map((part) => (typeof part === 'number' ? part : part.id)),
    ).toEqual(ids(parts))
    await deniedDelete('equipment-sets', set.id)
    await api.update({
      collection: 'clothing',
      id: parts[0].id,
      data: { equipmentSet: other.id },
      user,
      overrideAccess: false,
    })
    expect(
      ids(await readAll(reader(), 'clothing', { equipmentSet: { equals: other.id } })),
    ).toEqual([parts[0].id])
    for (const part of parts.slice(1))
      await api.update({
        collection: 'clothing',
        id: part.id,
        data: { equipmentSet: null },
        user,
        overrideAccess: false,
      })
    await api.delete({ collection: 'equipment-sets', id: set.id, user, overrideAccess: false })
    expect(await readAll(reader(), 'clothing', { id: { in: ids(parts) } })).toHaveLength(5)
  })

  it('paginates category reverse queries, reads the full join and protects ordinary rewards', async () => {
    const category = await fixtures.create('quest-categories', named())
    const other = await fixtures.create('quest-categories', named())
    const plain = await ordinary()
    const quests = []
    for (let index = 0; index < 5; index++)
      quests.push(
        await fixtures.create('quests', {
          ...named(),
          category: category.id,
          coins: 0,
          cooldown: 'Раз в сутки',
          requiredQuantity: 10,
          ordinaryRewards: [{ item: plain.id, quantity: 1 }],
        }),
      )
    expect(ids(await readAll(reader(), 'quests', { category: { equals: category.id } }))).toEqual(
      ids(quests),
    )
    const full = await api.findByID({
      collection: 'quest-categories',
      id: category.id,
      depth: 0,
      joins: { quests: { limit: 0, sort: 'id' } },
      user,
      overrideAccess: false,
    })
    expect(
      (full.quests?.docs ?? []).map((quest) => (typeof quest === 'number' ? quest : quest.id)),
    ).toEqual(ids(quests))
    await deniedDelete('quest-categories', category.id)
    await deniedDelete('ordinary-items', plain.id)
    await api.update({
      collection: 'quests',
      id: quests[0].id,
      data: { category: other.id },
      user,
      overrideAccess: false,
    })
    expect(ids(await readAll(reader(), 'quests', { category: { equals: category.id } }))).toEqual(
      ids(quests.slice(1)),
    )
    expect(ids(await readAll(reader(), 'quests', { category: { equals: other.id } }))).toEqual([
      quests[0].id,
    ])
    for (const quest of quests)
      await api.update({
        collection: 'quests',
        id: quest.id,
        data: { category: null, ordinaryRewards: [] },
        user,
        overrideAccess: false,
      })
    expect(await readAll(reader(), 'quests', { category: { equals: category.id } })).toEqual([])
    await api.delete({
      collection: 'quest-categories',
      id: category.id,
      user,
      overrideAccess: false,
    })
    await api.delete({ collection: 'ordinary-items', id: plain.id, user, overrideAccess: false })
    expect(await readAll(reader(), 'quests', { id: { in: ids(quests) } })).toHaveLength(5)
  })

  it('protects a scheduled time until all events release it', async () => {
    const existing = await readAll(reader(), 'event-times', {})
    const occupied = new Set(existing.map(({ time }) => time))
    let available: string | undefined
    for (let minute = 0; minute < 1440; minute++) {
      const candidate = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
      if (!occupied.has(candidate)) {
        available = candidate
        break
      }
    }
    if (!available)
      throw new Error('The dedicated test database has no unused time; use a clean test database.')
    const clock = await fixtures.create('event-times', { time: available, minutes: 0 })
    const one = await event([clock.id], [])
    const two = await event([clock.id], [])
    await deniedDelete('event-times', clock.id)
    await api.update({
      collection: 'events',
      id: one.id,
      data: { launchTimes: [] },
      user,
      overrideAccess: false,
    })
    await deniedDelete('event-times', clock.id)
    await api.update({
      collection: 'events',
      id: two.id,
      data: { launchTimes: [] },
      user,
      overrideAccess: false,
    })
    await api.delete({ collection: 'event-times', id: clock.id, user, overrideAccess: false })
    for (const id of [one.id, two.id])
      await expect(
        api.findByID({ collection: 'events', id, user, overrideAccess: false }),
      ).resolves.toMatchObject({ id })
  })
})

describe('quest fields and access control through Payload', () => {
  it('enforces explicitly selected access control in the reusable event function', async () => {
    await expect(
      findEvents({ payload: api, user: null, overrideAccess: false }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('migrates a legacy numeric quest cooldown on PATCH and preserves an explicit clear', async () => {
    const quest = await fixtures.create('quests', { ...named(), coins: 0 })
    // Reproduce a document from the old schema using the test adapter only.
    await api.db.updateOne({
      collection: 'quests',
      id: quest.id,
      data: { ...quest, cooldown: null, cooldownMinutes: 360 },
    })
    const legacy = await api.findByID({
      collection: 'quests',
      id: quest.id,
      user,
      overrideAccess: false,
    })
    expect(legacy.cooldown).toBe('360 минут')
    const saved = await api.update({
      collection: 'quests',
      id: quest.id,
      data: { name: fixtures.name() },
      user,
      overrideAccess: false,
    })
    expect(saved.cooldown).toBe('360 минут')
    expect(saved.cooldownMinutes).toBeNull()
    await api.update({
      collection: 'quests',
      id: quest.id,
      data: { cooldown: null },
      user,
      overrideAccess: false,
    })
    const cleared = await api.findByID({
      collection: 'quests',
      id: quest.id,
      user,
      overrideAccess: false,
    })
    expect(cleared.cooldown ?? null).toBeNull()
    expect(cleared.cooldownMinutes).toBeNull()
  })

  it('preserves text cooldown, optional quantity and rewards across PATCH and clearing', async () => {
    const item = await resource()
    const quest = await fixtures.create('quests', {
      ...named(),
      coins: 0,
      cooldown: '6 часов',
      requiredQuantity: 10,
      rewards: [{ resource: item.id, quantity: 2 }],
    })
    const patched = await api.update({
      collection: 'quests',
      id: quest.id,
      data: { name: fixtures.name() },
      depth: 0,
      user,
      overrideAccess: false,
    })
    expect(patched).toMatchObject({
      cooldown: '6 часов',
      requiredQuantity: 10,
      rewards: [{ resource: item.id, quantity: 2 }],
    })
    for (const requiredQuantity of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        api.update({
          collection: 'quests',
          id: quest.id,
          data: { requiredQuantity },
          user,
          overrideAccess: false,
        }),
      ).rejects.toMatchObject({ status: 400 })
    }
    await api.update({
      collection: 'quests',
      id: quest.id,
      data: { cooldown: '', requiredQuantity: null },
      user,
      overrideAccess: false,
    })
    const saved = await api.findByID({
      collection: 'quests',
      id: quest.id,
      depth: 0,
      user,
      overrideAccess: false,
    })
    expect(saved.cooldown).toBe('')
    expect(saved.requiredQuantity).toBeNull()
    expect(saved.rewards).toMatchObject([{ resource: item.id, quantity: 2 }])
    const empty = await fixtures.create('quests', { ...named(), coins: 0 })
    expect(empty.requiredQuantity ?? null).toBeNull()
    expect(empty.cooldown ?? null).toBeNull()
  })

  it.each([
    'ordinary-items',
    'resources',
    'equipment-sets',
    'clothing',
    'weapons',
    'event-times',
    'events',
    'quests',
    'quest-categories',
    'bosses',
  ] as const)('denies anonymous CRUD for %s and allows authenticated reads', async (collection) => {
    const data =
      collection === 'event-times'
        ? { time: '12:34', minutes: 0 }
        : { ...named(), coins: 0, cooldownMinutes: 0 }
    // Access is checked before field validation, including for malformed anonymous input.
    await expect(api.find({ collection, overrideAccess: false, user: null })).rejects.toMatchObject(
      { status: 403 },
    )
    await expect(
      api.create({ collection, data: data as never, overrideAccess: false, user: null }),
    ).rejects.toMatchObject({ status: 403 })
    const doc =
      collection === 'event-times'
        ? await time('12:34')
        : await fixtures.create(collection, data as never)
    await expect(
      api.findByID({ collection, id: doc.id, user, overrideAccess: false }),
    ).resolves.toMatchObject({ id: doc.id })
    await expect(
      api.update({ collection, id: doc.id, data: {}, overrideAccess: false, user: null }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      api.delete({ collection, id: doc.id, overrideAccess: false, user: null }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

// Known upstream 3.92.1 regression: page >= 3 uses (page - 1) * (limit + 1) - 1.
// Keep explicit expected-failure tests; direct paginated queries above are the supported workaround.
describe('known upstream join pagination defects (expected failures, not fixed)', () => {
  it.fails('minimal native join reproduction: three items, limit one, page three', async () => {
    const set = await fixtures.create('equipment-sets', named())
    const parts = []
    for (let index = 0; index < 3; index++)
      parts.push(await fixtures.create('clothing', { ...named(), equipmentSet: set.id }))
    const doc = await api.findByID({
      collection: 'equipment-sets',
      id: set.id,
      depth: 0,
      joins: { parts: { limit: 1, page: 3, sort: 'id' } },
      user,
      overrideAccess: false,
    })
    expect(
      (doc.parts?.docs ?? []).map((part) => (typeof part === 'number' ? part : part.id)),
    ).toEqual([parts[2].id])
  })
  it.fails('native join at the current default limit ten loses item twenty-one', async () => {
    const set = await fixtures.create('equipment-sets', named())
    const expected: number[] = []
    for (let index = 0; index < 21; index++) {
      expected.push((await fixtures.create('clothing', { ...named(), equipmentSet: set.id })).id)
    }
    const joined: number[] = []
    for (let page = 1; page <= 3; page++) {
      const doc = await api.findByID({
        collection: 'equipment-sets',
        id: set.id,
        depth: 0,
        joins: { parts: { page, sort: 'id' } },
        user,
        overrideAccess: false,
      })
      joined.push(
        ...(doc.parts?.docs ?? []).map((part) => (typeof part === 'number' ? part : part.id)),
      )
    }
    expect(joined).toEqual(expected)
  })
  it.fails.each(['parts', 'quests'] as const)(
    'native %s join must not lose the fifth document',
    async (kind) => {
      const parent =
        kind === 'parts'
          ? await fixtures.create('equipment-sets', named())
          : await fixtures.create('quest-categories', named())
      const expected: number[] = []
      for (let index = 0; index < 5; index++) {
        const child =
          kind === 'parts'
            ? await fixtures.create('clothing', { ...named(), equipmentSet: parent.id })
            : await fixtures.create('quests', { ...named(), coins: 0, category: parent.id })
        expected.push(child.id)
      }
      const joined: number[] = []
      for (let page = 1; page <= 3; page++) {
        if (kind === 'parts') {
          const doc = await api.findByID({
            collection: 'equipment-sets',
            id: parent.id,
            depth: 0,
            joins: { parts: { limit: 2, page, sort: 'id' } },
            user,
            overrideAccess: false,
          })
          joined.push(
            ...(doc.parts?.docs ?? []).map((part) => (typeof part === 'number' ? part : part.id)),
          )
        } else {
          const doc = await api.findByID({
            collection: 'quest-categories',
            id: parent.id,
            depth: 0,
            joins: { quests: { limit: 2, page, sort: 'id' } },
            user,
            overrideAccess: false,
          })
          joined.push(
            ...(doc.quests?.docs ?? []).map((quest) =>
              typeof quest === 'number' ? quest : quest.id,
            ),
          )
        }
      }
      expect(joined).toEqual(expected)
    },
  )
})

import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest'
import type { Payload } from 'payload'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import {
  getPublicQuests,
  getPublicQuestDetail,
  getQuestCategories,
  questCatalogOptions,
  parseQuestFilters,
} from '../../src/queries/public-quests'
import { collidingRewards } from '../helpers/collidingRewards'
import { questRewardKey } from '../../src/lib/quest-rewards'
let api: Payload, fixtures: ModelFixtures
const named = () => ({ name: fixtures.name(), slug: fixtures.name() })
describe('public quests through isolated PostgreSQL', () => {
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
  it('intersects all rewards of both types, applies every filter, keeps uncategorized quests and all pages', async () => {
    const { custom, ordinary } = await collidingRewards(fixtures, 'Одинаковая награда')
    expect(ordinary.id).toBe(custom.id)
    const otherCustom = await fixtures.create('resources', named()),
      otherOrdinary = await fixtures.create('ordinary-items', named())
    const categories = []
    for (let i = 0; i < 12; i++)
      categories.push(
        await fixtures.create('quest-categories', {
          ...named(),
          _order: `a${String.fromCharCode(65 + i)}`,
        }),
      )
    const category = categories[0],
      quests = []
    for (let i = 11; i >= 0; i--)
      quests.push(
        await fixtures.create('quests', {
          ...named(),
          _order: `a${String.fromCharCode(65 + i)}`,
          coins: i,
          category: i % 2 === 0 ? category.id : null,
          requiredQuantity: i === 0 ? null : 3,
          cooldown: i === 0 ? '' : 'Раз в сутки',
          rewards: [
            { resource: custom.id, quantity: 2 },
            ...(i % 2 === 0 ? [{ resource: otherCustom.id, quantity: 3 }] : []),
          ],
          ordinaryRewards:
            i % 3 === 0
              ? [
                  { item: ordinary.id, quantity: 4 },
                  { item: otherOrdinary.id, quantity: 5 },
                ]
              : [],
        }),
      )
    const options = { pageSize: 2, where: { name: { contains: fixtures.prefix } } }
    const all = await getPublicQuests(api, {}, options)
    expect(all.map((q) => q.id)).toEqual([...quests].reverse().map((q) => q.id))
    expect(all.filter((q) => q.category === null)).toHaveLength(6)
    const both = [
      { kind: 'resources', id: custom.id },
      { kind: 'ordinary-items', id: ordinary.id },
    ] as const
    const selected = await getPublicQuests(
      api,
      { category: category.id, coinsFrom: 0, coinsTo: 6, rewards: [...both] },
      options,
    )
    expect(selected.map((q) => q.coins)).toEqual([0, 6])
    expect(
      await getPublicQuests(api, { coinsFrom: 1, coinsTo: 5, rewards: [...both] }, options),
    ).toHaveLength(1)
    expect(
      (
        await getPublicQuests(
          api,
          {
            coinsFrom: 6,
            coinsTo: 6,
            rewards: [
              ...both,
              { kind: 'resources', id: otherCustom.id },
              { kind: 'ordinary-items', id: otherOrdinary.id },
            ],
          },
          options,
        )
      ).map((q) => q.coins),
    ).toEqual([6])
    expect(
      await getPublicQuests(api, { coinsFrom: 1, coinsTo: 1, rewards: [...both] }, options),
    ).toEqual([])
    const choices = questCatalogOptions(all, await getQuestCategories(api, 2))
    expect(choices).toMatchObject({ minimum: 0, maximum: 11 })
    expect(choices.categories).toHaveLength(12)
    expect(choices.rewards.filter((row) => row.name === 'Одинаковая награда')).toHaveLength(2)
    expect(new Set(choices.rewards.map(questRewardKey)).size).toBe(4)
    const detail = (await getPublicQuestDetail(api, quests[11].slug))!
    expect(detail.quest.cooldown).toBeNull()
    expect(detail.quest.requiredQuantity).toBeNull()
    expect(detail.quest.rewards.map((row) => row.quantity)).toEqual([2, 3, 4, 5])
    expect(await getPublicQuestDetail(api, fixtures.name())).toBeNull()
    expect(questCatalogOptions([], [])).toEqual({
      minimum: 0,
      maximum: 0,
      categories: [],
      rewards: [],
    })
    expect(
      (await getPublicQuests(api, { coinsFrom: 6, coinsTo: 6 }, options))[0],
    ).not.toHaveProperty('description')
  })
  it('permits category reads and rejects anonymous writes without exposing Users', async () => {
    for (const collection of ['quests', 'quest-categories'] as const) {
      const doc = await fixtures.create(collection, { ...named(), coins: 0 })
      await expect(
        api.findByID({ collection, id: doc.id, overrideAccess: false, user: null, depth: 0 }),
      ).resolves.toMatchObject({ id: doc.id })
      await expect(
        api.create({ collection, data: {} as never, overrideAccess: false, user: null }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        api.update({ collection, id: doc.id, data: {}, overrideAccess: false, user: null }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        api.delete({ collection, id: doc.id, overrideAccess: false, user: null }),
      ).rejects.toMatchObject({ status: 403 })
    }
    await expect(
      api.find({ collection: 'users', overrideAccess: false, user: null }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('validates typed rewards and rejects malformed categories and bounds', () => {
    expect(
      parseQuestFilters({
        category: 1,
        coinsFrom: 0,
        coinsTo: 2,
        rewards: [
          { kind: 'resources', id: 1 },
          { kind: 'ordinary-items', id: 1 },
          { kind: 'resources', id: 1 },
        ],
        overrideAccess: true,
      }),
    ).toEqual({
      category: 1,
      coinsFrom: 0,
      coinsTo: 2,
      rewards: [
        { kind: 'resources', id: 1 },
        { kind: 'ordinary-items', id: 1 },
      ],
    })
    for (const value of [
      null,
      [],
      { category: 0 },
      { category: '1' },
      { coinsFrom: -1 },
      { coinsFrom: 3, coinsTo: 2 },
      { rewards: [{ kind: 'weapons', id: 1 }] },
      { rewards: [{ kind: 'resources', id: '1' }] },
      { rewards: [null] },
    ])
      expect(() => parseQuestFilters(value)).toThrow()
  })
})

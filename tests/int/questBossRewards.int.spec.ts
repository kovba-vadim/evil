import { describe, expect, it, vi } from 'vitest'
import type { Boss, OrdinaryItem, Quest, Resource } from '../../src/payload-types'
import { validateBoss, validateQuest } from '../../src/hooks/questBossRewards'

// Isolated validation only. No Payload instance, database connection or writes.
function request() {
  return {
    payload: {
      find: vi.fn(async ({ where }) => ({
        docs: String(where.id.equals) === '999' ? [] : [{ id: where.id.equals }],
      })),
    },
  }
}

const quest = (data: Partial<Quest>, originalDoc?: Partial<Quest>) =>
  validateQuest({
    data,
    originalDoc,
    req: request(),
  } as unknown as Parameters<typeof validateQuest>[0])

const boss = (data: Partial<Boss>, originalDoc?: Partial<Boss>) =>
  validateBoss({
    data,
    originalDoc,
    req: request(),
  } as unknown as Parameters<typeof validateBoss>[0])

describe('quest and boss server validation without database', () => {
  it('accepts zero coins and fixed positive quest rewards', async () => {
    await expect(
      quest({ coins: 0, rewards: [{ resource: 1, quantity: 2 }] }),
    ).resolves.toBeDefined()
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects quest quantity %s',
    async (quantity) => {
      await expect(quest({ coins: 0, rewards: [{ resource: 1, quantity }] })).rejects.toThrow()
    },
  )

  it('rejects duplicate quest resources, including populated IDs', async () => {
    await expect(
      quest({
        coins: 0,
        rewards: [
          { resource: 1, quantity: 1 },
          { resource: { id: 1 } as Resource, quantity: 2 },
        ],
      }),
    ).rejects.toThrow()
  })

  it('rejects a nonexistent quest resource', async () => {
    await expect(quest({ coins: 0, rewards: [{ resource: 999, quantity: 1 }] })).rejects.toThrow()
  })

  it.each([-1, 0.5])(
    'rejects negative or fractional coins %s in both activities',
    async (coins) => {
      await expect(quest({ coins })).rejects.toThrow()
      await expect(boss({ coins, rewards: [{ resource: 1, quantity: 1 }] })).rejects.toThrow()
    },
  )

  it('accepts more than two boss rewards and an empty list', async () => {
    await expect(
      boss({ coins: 0, rewards: [1, 2, 3].map((resource) => ({ resource, quantity: 1 })) }),
    ).resolves.toBeDefined()
    await expect(boss({ coins: 0, rewards: [] })).resolves.toBeDefined()
  })

  it('rejects duplicate and nonexistent boss reward items', async () => {
    await expect(
      boss({
        coins: 0,
        rewards: [
          { resource: 1, quantity: 1 },
          { resource: { id: 1 } as Resource, quantity: 2 },
        ],
      }),
    ).rejects.toThrow()
    await expect(boss({ coins: 0, rewards: [{ resource: 999, quantity: 1 }] })).rejects.toThrow()
  })

  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects boss quantity %s',
    async (quantity) => {
      await expect(boss({ coins: 0, rewards: [{ resource: 1, quantity }] })).rejects.toThrow()
    },
  )

  it('allows renaming without resubmitting rewards', async () => {
    await expect(
      quest({ name: 'Новое имя' }, { coins: 0, rewards: [{ resource: 1, quantity: 1 }] }),
    ).resolves.toBeDefined()
    await expect(
      boss({ name: 'Новое имя' }, { coins: 0, rewards: [{ resource: 1, quantity: 2 }] }),
    ).resolves.toBeDefined()
  })

  it('accepts ordinary rewards separately from resources with the same numeric ID', async () => {
    await expect(
      quest({
        coins: 0,
        cooldown: '',
        rewards: [{ resource: 1, quantity: 2 }],
        ordinaryRewards: [{ item: 1, quantity: 3 }],
      }),
    ).resolves.toBeDefined()
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects ordinary quantity %s',
    async (quantity) => {
      await expect(quest({ coins: 0, ordinaryRewards: [{ item: 1, quantity }] })).rejects.toThrow()
    },
  )

  it('rejects duplicate ordinary items including populated IDs', async () => {
    await expect(
      quest({
        coins: 0,
        ordinaryRewards: [
          { item: 1, quantity: 1 },
          { item: { id: 1 } as OrdinaryItem, quantity: 2 },
        ],
      }),
    ).rejects.toThrow()
  })

  it('rejects nonexistent ordinary items and categories', async () => {
    await expect(
      quest({ coins: 0, ordinaryRewards: [{ item: 999, quantity: 1 }] }),
    ).rejects.toThrow()
    await expect(quest({ coins: 0, category: 999 })).rejects.toThrow()
  })

  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects required quantity %s',
    async (requiredQuantity) => {
      await expect(quest({ coins: 0, requiredQuantity })).rejects.toThrow()
    },
  )

  it('accepts descriptive cooldown, optional quantity and category', async () => {
    await expect(
      quest({ coins: 0, cooldown: '6 часов', requiredQuantity: 10, category: 1 }),
    ).resolves.toBeDefined()
    await expect(
      quest({ coins: 0, cooldown: 'Раз в сутки', requiredQuantity: null, category: null }),
    ).resolves.toBeDefined()
  })

  it('preserves both reward lists during category and cooldown PATCH', async () => {
    const original: Partial<Quest> = {
      coins: 0,
      cooldown: '0 минут',
      category: 1,
      rewards: [{ resource: 1, quantity: 2 }],
      ordinaryRewards: [{ item: 1, quantity: 3 }],
    }
    await expect(quest({ category: null, cooldown: '30 минут' }, original)).resolves.toMatchObject({
      category: null,
      cooldown: '30 минут',
    })
    expect(original.rewards).toEqual([{ resource: 1, quantity: 2 }])
    expect(original.ordinaryRewards).toEqual([{ item: 1, quantity: 3 }])
  })

  it('allows saving a legacy quest without a category or saved cooldown', async () => {
    const original: Partial<Quest> = { coins: 0, rewards: [{ resource: 1, quantity: 2 }] }
    await expect(quest({ name: 'Имя' }, original)).resolves.toMatchObject({ name: 'Имя' })
  })
})

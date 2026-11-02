import { describe, expect, it } from 'vitest'
import type { Boss, Resource } from '../../src/payload-types'
import {
  migrateBossRewards,
  prepareBossRewardRows,
  readBossRewards,
  withLegacyBossRewards,
} from '../../src/hooks/bossRewards'

type Args = Parameters<typeof migrateBossRewards>[0]
const migrate = (data: Partial<Boss>, originalDoc?: Partial<Boss>) =>
  migrateBossRewards({ data, originalDoc } as Args)

describe('boss rewards transition without database', () => {
  it('copies both legacy links with quantity one during PATCH', () => {
    expect(migrate({ name: 'Имя' }, { goldenHeart: 1, personalHeart: 2 })).toMatchObject({
      name: 'Имя',
      rewards: [
        { resource: 1, quantity: 1 },
        { resource: 2, quantity: 1 },
      ],
      goldenHeart: null,
      personalHeart: null,
    })
  })

  it('converts the fallback array before Payload merges it into PATCH data', async () => {
    const originalDoc = { rewards: [], goldenHeart: 1, personalHeart: 2 }
    const rewards = await prepareBossRewardRows({
      value: [],
      siblingData: { name: 'Имя' },
      originalDoc,
    } as unknown as Parameters<typeof prepareBossRewardRows>[0])
    expect(migrate({ name: 'Имя', rewards }, originalDoc)).toMatchObject({
      rewards: [
        { resource: 1, quantity: 1 },
        { resource: 2, quantity: 1 },
      ],
      goldenHeart: null,
      personalHeart: null,
    })
  })

  it('distinguishes an explicit empty array from the stored fallback', async () => {
    expect(
      await prepareBossRewardRows({
        value: [],
        siblingData: { rewards: [] },
        originalDoc: { goldenHeart: 1 },
      } as unknown as Parameters<typeof prepareBossRewardRows>[0]),
    ).toEqual([])
  })

  it('deduplicates legacy IDs and preserves existing quantities and row IDs', () => {
    const original = {
      goldenHeart: 1,
      personalHeart: { id: 1 } as Resource,
      rewards: [{ id: 'row', resource: 1, quantity: 5 }],
    }
    expect(withLegacyBossRewards(original)).toEqual(original.rewards)
    expect(original.goldenHeart).toBe(1)
    expect(withLegacyBossRewards({ goldenHeart: 1, personalHeart: 1 })).toEqual([
      { resource: 1, quantity: 1 },
    ])
  })

  it('keeps partial legacy data and appends missing items', () => {
    expect(
      withLegacyBossRewards({ personalHeart: 2, rewards: [{ resource: 1, quantity: 3 }] }),
    ).toEqual([
      { resource: 1, quantity: 3 },
      { resource: 2, quantity: 1 },
    ])
  })

  it('displays both legacy rewards before saving without modifying the document', async () => {
    const doc = { goldenHeart: 1, personalHeart: 2 }
    expect(await readBossRewards({ doc } as Parameters<typeof readBossRewards>[0])).toMatchObject({
      rewards: [
        { resource: 1, quantity: 1 },
        { resource: 2, quantity: 1 },
      ],
    })
    expect(doc).not.toHaveProperty('rewards')
  })

  it('does not duplicate rewards on a repeated migration', () => {
    const first = migrate({}, { goldenHeart: 1, personalHeart: 2 }) as Partial<Boss>
    expect(migrate({}, first)).not.toHaveProperty('rewards')
    expect(withLegacyBossRewards(first)).toEqual(first.rewards)
  })

  it.each([[], null])(
    'honors explicit reward clearing %s without resurrecting legacy links',
    (rewards) => {
      const saved = migrate({ rewards }, { goldenHeart: 1, personalHeart: 2 }) as Partial<Boss>
      expect(saved).toMatchObject({ rewards, goldenHeart: null, personalHeart: null })
      expect(withLegacyBossRewards(saved)).toEqual([])
    },
  )

  it('leaves a new boss without legacy rewards empty', () => {
    expect(migrate({ name: 'Босс' })).not.toHaveProperty('rewards')
  })
})

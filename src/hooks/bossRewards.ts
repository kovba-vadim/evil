import type { CollectionAfterReadHook, CollectionBeforeValidateHook, FieldHook } from 'payload'
import type { Boss } from '../payload-types'

type LegacyBoss = Pick<Boss, 'rewards' | 'goldenHeart' | 'personalHeart'>

const idOf = (value: NonNullable<Boss['goldenHeart']>) =>
  typeof value === 'object' ? value.id : value

/** Append only missing legacy IDs; keep existing quantities, order and row IDs. */
export function withLegacyBossRewards(doc: Partial<LegacyBoss>): NonNullable<Boss['rewards']> {
  const rewards = [...(doc.rewards ?? [])]
  const seen = new Set(rewards.map(({ resource }) => String(idOf(resource))))
  for (const value of [doc.goldenHeart, doc.personalHeart]) {
    if (value == null) continue
    const id = idOf(value)
    if (seen.has(String(id))) continue
    rewards.push({ resource: value, quantity: 1 })
    seen.add(String(id))
  }
  return rewards
}

/** Display legacy rewards without writing. forceSelect supplies dependencies. */
export const readBossRewards: CollectionAfterReadHook<Boss> = ({ doc }) => {
  if (doc.goldenHeart != null || doc.personalHeart != null) {
    return { ...doc, rewards: withLegacyBossRewards(doc) }
  }
  return doc
}

/** Field hook runs before Payload copies the fallback array into incoming data. */
export const prepareBossRewardRows: FieldHook = ({ value, siblingData, originalDoc }) => {
  if (siblingData.rewards !== undefined) return value
  const doc = { ...originalDoc, ...siblingData, rewards: value }
  return doc.goldenHeart != null || doc.personalHeart != null ? withLegacyBossRewards(doc) : value
}

/** Persist and clear legacy links in the same Payload transaction. */
export const migrateBossRewards: CollectionBeforeValidateHook<Boss> = ({ data, originalDoc }) => {
  if (!data) return data
  const legacy = { ...originalDoc, ...data }
  const hasLegacy = legacy.goldenHeart != null || legacy.personalHeart != null
  if (data.rewards === undefined && hasLegacy) {
    data.rewards = withLegacyBossRewards(legacy)
  }
  // An explicit array (including []) replaces the displayed legacy rewards.
  // Failed validation/save rolls back both the array and clearing these links.
  if (hasLegacy || data.rewards !== undefined) {
    data.goldenHeart = null
    data.personalHeart = null
  }
  return data
}

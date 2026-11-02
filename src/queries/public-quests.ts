import type { Payload, Where } from 'payload'
import type { Quest } from '../payload-types'
import { byIDs } from './public-items'
import { questRewardKey, type QuestRewardChoice } from '../lib/quest-rewards'

export interface QuestFilters {
  category?: number
  coinsFrom?: number
  coinsTo?: number
  rewards?: QuestRewardChoice[]
}
export interface PublicQuest {
  id: number
  name: string
  slug: string
  coins: number
  category: { id: number; name: string } | null
  requiredQuantity: number | null
  cooldown: string | null
  rewards: (QuestRewardChoice & { name: string; slug: string; quantity: number })[]
}
const idOf = (value: number | { id: number }) => (typeof value === 'number' ? value : value.id)
const select = {
  name: true,
  slug: true,
  category: true,
  coins: true,
  requiredQuantity: true,
  cooldown: true,
  rewards: true,
  ordinaryRewards: true,
} as const
type QuestSummary = Pick<
  Quest,
  | 'id'
  | 'name'
  | 'slug'
  | 'category'
  | 'coins'
  | 'requiredQuantity'
  | 'cooldown'
  | 'rewards'
  | 'ordinaryRewards'
>
async function readQuests(
  payload: Payload,
  where: Where,
  pageSize: number,
): Promise<QuestSummary[]> {
  const docs: QuestSummary[] = []
  for (let page = 1; ; page++) {
    const result = await payload.find({
      collection: 'quests',
      select,
      where,
      page,
      limit: pageSize,
      sort: ['_order', 'id'],
      depth: 0,
      user: null,
      overrideAccess: false,
    })
    docs.push(...result.docs)
    if (!result.hasNextPage) return docs
  }
}
/** Separate array predicates and intersect IDs; every intermediate query is paginated. */
export async function findQuests(
  payload: Payload,
  filters: QuestFilters = {},
  { pageSize = 100, where = {} }: { pageSize?: number; where?: Where } = {},
) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new RangeError('pageSize must be positive.')
  const and: Where[] = [where]
  if (filters.category !== undefined) and.push({ category: { equals: filters.category } })
  if (filters.coinsFrom !== undefined)
    and.push({ coins: { greater_than_equal: filters.coinsFrom } })
  if (filters.coinsTo !== undefined) and.push({ coins: { less_than_equal: filters.coinsTo } })
  let matching: number[] | undefined
  const rewards = new Map((filters.rewards ?? []).map((reward) => [questRewardKey(reward), reward]))
  for (const reward of rewards.values()) {
    const candidates = await readQuests(
      payload,
      {
        and: [
          ...and,
          {
            [reward.kind === 'resources' ? 'rewards.resource' : 'ordinaryRewards.item']: {
              equals: reward.id,
            },
          },
          ...(matching ? [{ id: { in: matching } }] : []),
        ],
      },
      pageSize,
    )
    matching = candidates.map((doc) => doc.id)
    if (!matching.length) return []
  }
  if (matching) and.push({ id: { in: matching } })
  return readQuests(payload, { and }, pageSize)
}
export async function getQuestCategories(payload: Payload, pageSize = 100, where: Where = {}) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new RangeError('pageSize must be positive.')
  const docs: { id: number; name: string }[] = []
  for (let page = 1; ; page++) {
    const result = await payload.find({
      collection: 'quest-categories',
      select: { name: true },
      joins: { quests: false },
      where,
      page,
      limit: pageSize,
      sort: ['_order', 'id'],
      depth: 0,
      overrideAccess: false,
      user: null,
    })
    docs.push(...result.docs.map(({ id, name }) => ({ id, name })))
    if (!result.hasNextPage) return docs
  }
}
async function questCards(
  payload: Payload,
  docs: QuestSummary[],
  pageSize: number,
): Promise<PublicQuest[]> {
  const categoryIDs = [
    ...new Set(docs.flatMap((doc) => (doc.category ? [idOf(doc.category)] : []))),
  ]
  const [resources, ordinary, categories] = await Promise.all([
    byIDs(
      payload,
      'resources',
      docs.flatMap((doc) => (doc.rewards ?? []).map((row) => idOf(row.resource))),
      { name: true, slug: true },
      pageSize,
    ),
    byIDs(
      payload,
      'ordinary-items',
      docs.flatMap((doc) => (doc.ordinaryRewards ?? []).map((row) => idOf(row.item))),
      { name: true, slug: true },
      pageSize,
    ),
    categoryIDs.length
      ? getQuestCategories(payload, pageSize, { id: { in: categoryIDs } })
      : Promise.resolve([]),
  ])
  const customMap = new Map(resources.map((doc) => [doc.id, doc])),
    ordinaryMap = new Map(ordinary.map((doc) => [doc.id, doc])),
    categoryMap = new Map(categories.map((doc) => [doc.id, doc]))
  return docs.map((doc) => {
    const category = doc.category ? categoryMap.get(idOf(doc.category)) : null
    if (doc.category && !category) throw new Error('Не удалось прочитать категорию квеста.')
    const rewards: PublicQuest['rewards'] = []
    for (const row of doc.rewards ?? []) {
      const item = customMap.get(idOf(row.resource))
      if (!item) throw new Error('Не удалось прочитать награду квеста.')
      rewards.push({
        kind: 'resources',
        id: item.id,
        name: item.name,
        slug: item.slug,
        quantity: row.quantity,
      })
    }
    for (const row of doc.ordinaryRewards ?? []) {
      const item = ordinaryMap.get(idOf(row.item))
      if (!item) throw new Error('Не удалось прочитать награду квеста.')
      rewards.push({
        kind: 'ordinary-items',
        id: item.id,
        name: item.name,
        slug: item.slug,
        quantity: row.quantity,
      })
    }
    return {
      id: doc.id,
      name: doc.name,
      slug: doc.slug,
      coins: doc.coins,
      category: category ?? null,
      requiredQuantity: doc.requiredQuantity ?? null,
      cooldown: doc.cooldown?.trim() ? doc.cooldown : null,
      rewards,
    }
  })
}
export async function getPublicQuests(
  payload: Payload,
  filters: QuestFilters = {},
  options: { pageSize?: number; where?: Where } = {},
) {
  return questCards(payload, await findQuests(payload, filters, options), options.pageSize ?? 100)
}
export function questCatalogOptions(
  quests: PublicQuest[],
  categories: { id: number; name: string }[],
) {
  const choices = new Map(
    quests.flatMap((quest) =>
      quest.rewards.map(
        (reward) =>
          [
            questRewardKey(reward),
            { id: reward.id, kind: reward.kind, name: reward.name },
          ] as const,
      ),
    ),
  )
  return {
    minimum: quests.reduce((n, q) => Math.min(n, q.coins), quests[0]?.coins ?? 0),
    maximum: quests.reduce((n, q) => Math.max(n, q.coins), quests[0]?.coins ?? 0),
    categories,
    rewards: [...choices.values()].sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'ru'),
    ),
  }
}
export async function getPublicQuestDetail(payload: Payload, slug: string) {
  const result = await payload.find({
    collection: 'quests',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: null,
  })
  const doc = result.docs[0]
  if (!doc) return null
  return { quest: (await questCards(payload, [doc], 100))[0], description: doc.description }
}
export function parseQuestFilters(value: unknown): QuestFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Некорректные фильтры.')
  const data = value as Record<string, unknown>,
    result: QuestFilters = {}
  for (const key of ['coinsFrom', 'coinsTo', 'category'] as const) {
    const v = data[key]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < (key === 'category' ? 1 : 0))
      throw new Error('Некорректная граница или категория.')
    result[key] = v
  }
  if (
    result.coinsFrom !== undefined &&
    result.coinsTo !== undefined &&
    result.coinsFrom > result.coinsTo
  )
    throw new Error('От не должно превышать До.')
  if (data.rewards !== undefined) {
    if (!Array.isArray(data.rewards)) throw new Error('Некорректные награды.')
    const rewards: QuestRewardChoice[] = []
    for (const row of data.rewards) {
      if (
        !row ||
        typeof row !== 'object' ||
        !['resources', 'ordinary-items'].includes(row.kind) ||
        !Number.isSafeInteger(row.id) ||
        row.id < 1
      )
        throw new Error('Некорректная награда.')
      rewards.push({ kind: row.kind, id: row.id })
    }
    result.rewards = [...new Map(rewards.map((row) => [questRewardKey(row), row])).values()]
  }
  return result
}

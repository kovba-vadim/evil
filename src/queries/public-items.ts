import type { DataFromCollectionSlug, Payload, TypedCollectionSelect, Where } from 'payload'
import type { Boss, Clothing, Media, OrdinaryItem, Resource } from '../payload-types'

type PublicCollection =
  | 'equipment-sets'
  | 'resources'
  | 'ordinary-items'
  | 'events'
  | 'quests'
  | 'bosses'
  | 'clothing'
  | 'weapons'
  | 'media'
export interface ItemCard {
  id: number
  name: string
  slug: string
  image: Media | null
}
export interface RewardSource {
  id: number
  name: string
  kind: 'events' | 'quests' | 'bosses'
  slug?: string
  minimum: number
  maximum: number
}
export interface CraftUse {
  id: number
  name: string
  slug: string
  kind: 'resources' | 'clothing' | 'weapons'
}
export interface PublicRecipe {
  coins: number
  ingredients: (ItemCard & { kind: 'resources' | 'ordinary-items'; quantity: number })[]
}
export interface ResourceDetail {
  item: ItemCard & { description: Resource['description'] }
  sources: RewardSource[]
  recipe: PublicRecipe | null
  uses: CraftUse[]
}

/** Small projection, depth zero, no native joins, all transport pages. */
async function all<T extends PublicCollection>(
  payload: Payload,
  collection: T,
  select: TypedCollectionSelect[T],
  where: Where,
  pageSize: number,
): Promise<DataFromCollectionSlug<T>[]> {
  const docs: DataFromCollectionSlug<T>[] = []
  for (let page = 1; ; page++) {
    const result = await payload.find({
      collection,
      select,
      where,
      page,
      limit: pageSize,
      sort: collection === 'media' ? 'id' : ['_order', 'id'],
      depth: 0,
      overrideAccess: false,
      user: null,
    })
    docs.push(...result.docs)
    if (!result.hasNextPage) return docs
  }
}

function size(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError('pageSize must be a positive integer.')
  return value
}
const idOf = (value: number | { id: number }) => (typeof value === 'number' ? value : value.id)

export async function byIDs<T extends 'media' | 'resources' | 'ordinary-items'>(
  payload: Payload,
  collection: T,
  ids: number[],
  select: TypedCollectionSelect[T],
  pageSize: number,
) {
  const unique = [...new Set(ids)]
  const docs: DataFromCollectionSlug<T>[] = []
  for (let index = 0; index < unique.length; index += 200) {
    docs.push(
      ...(await all(
        payload,
        collection,
        select,
        { id: { in: unique.slice(index, index + 200) } },
        pageSize,
      )),
    )
  }
  return docs
}

async function cards(
  payload: Payload,
  docs: Pick<Resource | OrdinaryItem, 'id' | 'name' | 'slug' | 'image'>[],
  pageSize: number,
): Promise<ItemCard[]> {
  const images = await byIDs(
    payload,
    'media',
    docs.flatMap(({ image }) => (image ? [idOf(image)] : [])),
    // Payload computes upload URLs from filename during afterRead.
    { url: true, filename: true, mimeType: true, alt: true, width: true, height: true },
    pageSize,
  )
  const media = new Map(images.map((image) => [image.id, image]))
  return docs.map((doc) => ({
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    image: doc.image ? (media.get(idOf(doc.image)) ?? null) : null,
  }))
}

export async function getResourceCatalog(
  payload: Payload,
  { pageSize = 100, where = {} }: { pageSize?: number; where?: Where } = {},
) {
  size(pageSize)
  const docs = await all(
    payload,
    'resources',
    { name: true, slug: true, image: true },
    where,
    pageSize,
  )
  return cards(payload, docs, pageSize)
}

export async function getOrdinaryItem(payload: Payload, slug: string, pageSize = 100) {
  size(pageSize)
  const result = await payload.find({
    collection: 'ordinary-items',
    where: { slug: { equals: slug } },
    select: { name: true, slug: true, image: true, description: true },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: null,
  })
  const doc = result.docs[0]
  if (!doc) return null
  return { ...(await cards(payload, [doc], pageSize))[0], description: doc.description }
}

export async function getResourceDetail(
  payload: Payload,
  slug: string,
  { pageSize = 100 }: { pageSize?: number } = {},
): Promise<ResourceDetail | null> {
  size(pageSize)
  const result = await payload.find({
    collection: 'resources',
    where: { slug: { equals: slug } },
    select: {
      name: true,
      slug: true,
      image: true,
      description: true,
      craftable: true,
      recipe: true,
    },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: null,
  })
  const doc = result.docs[0]
  if (!doc) return null
  const rewardWhere: Where = { 'rewards.resource': { equals: doc.id } }
  const [itemCards, events, quests, bosses, uses] = await Promise.all([
    cards(payload, [doc], pageSize),
    all(payload, 'events', { name: true, slug: true, rewards: true }, rewardWhere, pageSize),
    all(payload, 'quests', { name: true, slug: true, rewards: true }, rewardWhere, pageSize),
    // Include unmigrated legacy links until the separate backfill is completed.
    all(
      payload,
      'bosses',
      { name: true, slug: true, rewards: true },
      {
        or: [
          rewardWhere,
          { goldenHeart: { equals: doc.id } },
          { personalHeart: { equals: doc.id } },
        ],
      },
      pageSize,
    ),
    Promise.all(
      (['resources', 'clothing', 'weapons'] as const).map(async (kind) => {
        const docs = await all(
          payload,
          kind,
          { name: true, slug: true, craftable: true },
          {
            and: [
              { craftable: { equals: true } },
              { 'recipe.resourceIngredients.resource': { equals: doc.id } },
            ],
          },
          pageSize,
        )
        return docs.map(({ id, name, slug }) => ({ id, name, slug, kind }))
      }),
    ),
  ])
  const sources: RewardSource[] = []
  for (const event of events) {
    const reward = event.rewards?.find(({ resource }) => idOf(resource) === doc.id)
    if (reward)
      sources.push({
        id: event.id,
        name: event.name,
        kind: 'events',
        slug: event.slug,
        minimum: reward.minQuantity,
        maximum: reward.maxQuantity,
      })
  }
  for (const [kind, documents] of [
    ['quests', quests],
    ['bosses', bosses],
  ] as const) {
    for (const source of documents) {
      const reward = source.rewards?.find(({ resource }) => idOf(resource) === doc.id)
      if (reward)
        sources.push({
          id: source.id,
          name: source.name,
          kind,
          slug: source.slug,
          minimum: reward.quantity,
          maximum: reward.quantity,
        })
    }
  }
  const recipe = await resolveRecipe(payload, doc, pageSize)
  return {
    item: { ...itemCards[0], description: doc.description },
    sources,
    recipe,
    uses: uses.flat(),
  }
}

async function resolveRecipe(
  payload: Payload,
  doc: Pick<Resource, 'craftable' | 'recipe'>,
  pageSize: number,
): Promise<PublicRecipe | null> {
  let recipe: PublicRecipe | null = null
  if (doc.craftable && doc.recipe) {
    const custom = doc.recipe.resourceIngredients ?? []
    const ordinary = doc.recipe.ordinaryIngredients ?? []
    const select = { name: true, slug: true, image: true } as const
    const [customDocs, ordinaryDocs] = await Promise.all([
      byIDs(
        payload,
        'resources',
        custom.map(({ resource }) => idOf(resource)),
        select,
        pageSize,
      ),
      byIDs(
        payload,
        'ordinary-items',
        ordinary.map(({ item }) => idOf(item)),
        select,
        pageSize,
      ),
    ])
    const [customCards, ordinaryCards] = await Promise.all([
      cards(payload, customDocs, pageSize),
      cards(payload, ordinaryDocs, pageSize),
    ])
    const ingredients: PublicRecipe['ingredients'] = []
    for (const [kind, rows, resolved] of [
      [
        'resources',
        custom.map(({ resource, quantity }) => ({ id: idOf(resource), quantity })),
        customCards,
      ],
      [
        'ordinary-items',
        ordinary.map(({ item, quantity }) => ({ id: idOf(item), quantity })),
        ordinaryCards,
      ],
    ] as const) {
      const lookup = new Map(resolved.map((item) => [item.id, item]))
      for (const row of rows) {
        const item = lookup.get(row.id)
        if (!item) throw new Error('Не удалось прочитать ингредиент рецепта.')
        ingredients.push({ ...item, kind, quantity: row.quantity })
      }
    }
    recipe = { coins: doc.recipe.coins ?? 0, ingredients }
  }
  return recipe
}

export interface EquipmentDetail {
  item: ItemCard & { description: Resource['description'] }
  recipe: PublicRecipe | null
  setName: string | null
  setSlug: string | null
}

export async function getEquipmentDetail(
  payload: Payload,
  collection: 'clothing' | 'weapons',
  slug: string,
): Promise<EquipmentDetail | null> {
  const result = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    select: {
      name: true,
      slug: true,
      image: true,
      description: true,
      craftable: true,
      recipe: true,
      ...(collection === 'clothing' ? { equipmentSet: true } : {}),
    },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: null,
  })
  const doc = result.docs[0]
  if (!doc) return null
  const [itemCards, recipe] = await Promise.all([
    cards(payload, [doc], 100),
    resolveRecipe(payload, doc, 100),
  ])
  let setName: string | null = null
  let setSlug: string | null = null
  const equipmentSet = collection === 'clothing' ? (doc as Clothing).equipmentSet : null
  if (equipmentSet) {
    const set = await payload.findByID({
      collection: 'equipment-sets',
      id: idOf(equipmentSet),
      select: { name: true, slug: true },
      depth: 0,
      joins: { parts: false },
      overrideAccess: false,
      user: null,
    })
    setName = set.name
    setSlug = set.slug
  }
  return { item: { ...itemCards[0], description: doc.description }, recipe, setName, setSlug }
}

export async function getEquipmentCatalog(
  payload: Payload,
  collection: 'equipment-sets' | 'clothing' | 'weapons',
  { pageSize = 100, where = {} }: { pageSize?: number; where?: Where } = {},
): Promise<ItemCard[]> {
  size(pageSize)
  const docs = await all(
    payload,
    collection,
    { name: true, slug: true, image: true },
    collection === 'clothing' ? { and: [where, { equipmentSet: { exists: false } }] } : where,
    pageSize,
  )
  return cards(payload, docs, pageSize)
}

export async function getSetDetail(payload: Payload, slug: string, pageSize = 100) {
  size(pageSize)
  const result = await payload.find({
    collection: 'equipment-sets',
    where: { slug: { equals: slug } },
    select: { name: true, slug: true, image: true, description: true },
    limit: 1,
    depth: 0,
    joins: { parts: false },
    overrideAccess: false,
    user: null,
  })
  const doc = result.docs[0]
  if (!doc) return null
  const parts = await all(
    payload,
    'clothing',
    { name: true, slug: true, image: true, craftable: true, recipe: true },
    { equipmentSet: { equals: doc.id } },
    pageSize,
  )
  // A part and each ingredient within its recipe count once, even if a transport
  // page or a malformed relationship repeats them. Different parts still add up.
  const uniqueParts = [...new Map(parts.map((part) => [part.id, part])).values()]
  const resourceID = (value: number | { id: number } | null | undefined) =>
    value == null ? null : idOf(value)
  const resources = await byIDs(
    payload,
    'resources',
    uniqueParts.flatMap((part) =>
      part.craftable
        ? (part.recipe?.resourceIngredients ?? []).flatMap((row) => {
            const id = resourceID(row.resource)
            return id == null ? [] : [id]
          })
        : [],
    ),
    { name: true, slug: true, image: true },
    pageSize,
  )
  const [resolved, ingredients] = await Promise.all([
    cards(payload, [doc, ...uniqueParts], pageSize),
    cards(payload, resources, pageSize),
  ])
  const lookup = new Map(ingredients.map((item) => [item.id, item]))
  const totals = new Map<number, PublicRecipe['ingredients'][number]>()
  let coins = 0
  let incomplete = false
  const partCards = uniqueParts.map((part, index) => {
    let recipe: PublicRecipe | null = null
    let missingIngredients = false
    if (part.craftable && part.recipe) {
      const seen = new Set<number>()
      const items: PublicRecipe['ingredients'] = []
      for (const row of part.recipe.resourceIngredients ?? []) {
        const id = resourceID(row.resource)
        const item = id == null ? undefined : lookup.get(id)
        if (!item || !item.slug || !Number.isSafeInteger(row.quantity) || row.quantity <= 0) {
          missingIngredients = true
          continue
        }
        if (seen.has(item.id)) continue
        seen.add(item.id)
        const ingredient = { ...item, kind: 'resources' as const, quantity: row.quantity }
        items.push(ingredient)
        const previous = totals.get(item.id)
        totals.set(item.id, {
          ...ingredient,
          quantity: (previous?.quantity ?? 0) + row.quantity,
        })
      }
      if (part.recipe.coins == null) missingIngredients = true
      recipe = { ingredients: items, coins: part.recipe.coins ?? 0 }
      coins += recipe.coins
    }
    if (!recipe || missingIngredients) incomplete = true
    return { ...resolved[index + 1], recipe, missingIngredients }
  })
  return {
    item: { ...resolved[0], description: doc.description },
    parts: partCards,
    totalRecipe: { ingredients: [...totals.values()], coins },
    incomplete,
  }
}

export type CraftKind = 'resources' | 'clothing' | 'weapons'
export type CraftCard = ItemCard & { kind: CraftKind }

export async function getCraftCatalog(
  payload: Payload,
  { pageSize = 100, where = {} }: { pageSize?: number; where?: Where } = {},
): Promise<CraftCard[]> {
  size(pageSize)
  const groups = await Promise.all(
    (['resources', 'clothing', 'weapons'] as const).map(async (kind) => {
      const docs = await all(
        payload,
        kind,
        { name: true, slug: true, image: true },
        { and: [where, { craftable: { equals: true } }] },
        pageSize,
      )
      return docs.map((doc) => ({ ...doc, kind }))
    }),
  )
  const docs = groups.flat()
  const resolved = await cards(payload, docs, pageSize)
  return resolved.map((item, index) => ({ ...item, kind: docs[index].kind }))
}

export type BossCard = ItemCard & {
  coins: number
  rewards: (Pick<ItemCard, 'id' | 'name' | 'slug'> & { quantity: number })[]
}
export type BossDetail = {
  item: ItemCard & { description: Boss['description'] }
  coins: number
  rewards: BossCard['rewards']
}

async function bossCards(
  payload: Payload,
  docs: Pick<Boss, 'id' | 'name' | 'slug' | 'image' | 'coins' | 'rewards'>[],
  pageSize: number,
): Promise<BossCard[]> {
  const [items, resources] = await Promise.all([
    cards(payload, docs, pageSize),
    byIDs(
      payload,
      'resources',
      docs.flatMap((doc) => (doc.rewards ?? []).map((row) => idOf(row.resource))),
      { name: true, slug: true },
      pageSize,
    ),
  ])
  const lookup = new Map(resources.map((resource) => [resource.id, resource]))
  return items.map((item, index) => ({
    ...item,
    coins: docs[index].coins,
    rewards: (docs[index].rewards ?? []).map((row) => {
      const resource = lookup.get(idOf(row.resource))
      if (!resource) throw new Error('Не удалось прочитать предмет награды босса.')
      return { id: resource.id, name: resource.name, slug: resource.slug, quantity: row.quantity }
    }),
  }))
}

export async function getBossCatalog(
  payload: Payload,
  { pageSize = 100, where = {} }: { pageSize?: number; where?: Where } = {},
): Promise<BossCard[]> {
  size(pageSize)
  const docs = await all(
    payload,
    'bosses',
    { name: true, slug: true, image: true, coins: true, rewards: true },
    where,
    pageSize,
  )
  return bossCards(payload, docs, pageSize)
}

export async function getBossDetail(payload: Payload, slug: string): Promise<BossDetail | null> {
  const result = await payload.find({
    collection: 'bosses',
    where: { slug: { equals: slug } },
    select: { name: true, slug: true, image: true, description: true, coins: true, rewards: true },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: null,
  })
  const doc = result.docs[0]
  if (!doc) return null
  const card = (await bossCards(payload, [doc], 100))[0]
  return {
    item: {
      id: card.id,
      name: card.name,
      slug: card.slug,
      image: card.image,
      description: doc.description,
    },
    coins: card.coins,
    rewards: card.rewards,
  }
}

import type { Payload, Where } from 'payload'
import type { Event } from '../payload-types'
import { findEvents, type EventFilters } from './findEvents'
import { byIDs } from './public-items'

export interface PublicEvent {
  id: number
  name: string
  slug: string
  shortDescription: string | null
  coins: number
  rewards: { id: number; name: string; slug: string; minimum: number; maximum: number }[]
}
const idOf = (value: number | { id: number }) => (typeof value === 'number' ? value : value.id)
export async function eventCards(
  payload: Payload,
  docs: Pick<Event, 'id' | 'name' | 'slug' | 'shortDescription' | 'coins' | 'rewards'>[],
  pageSize = 100,
): Promise<PublicEvent[]> {
  const resources = await byIDs(
    payload,
    'resources',
    docs.flatMap((doc) => (doc.rewards ?? []).map((row) => idOf(row.resource))),
    { name: true, slug: true },
    pageSize,
  )
  const lookup = new Map(resources.map((doc) => [doc.id, doc]))
  return docs.map((doc) => ({
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    shortDescription: doc.shortDescription ?? null,
    coins: doc.coins,
    rewards: (doc.rewards ?? []).map((row) => {
      const resource = lookup.get(idOf(row.resource))
      if (!resource) throw new Error('Не удалось прочитать предмет награды ивента.')
      return {
        id: resource.id,
        name: resource.name,
        slug: resource.slug,
        minimum: row.minQuantity,
        maximum: row.maxQuantity,
      }
    }),
  }))
}
export async function getPublicEvents(
  payload: Payload,
  filters: EventFilters = {},
  { pageSize = 100, where = {} }: { pageSize?: number; where?: Where } = {},
) {
  return eventCards(
    payload,
    await findEvents({
      payload,
      filters,
      where,
      pageSize,
      sort: ['_order', 'id'],
      overrideAccess: false,
      user: null,
    }),
    pageSize,
  )
}
export function eventCatalogOptions(events: PublicEvent[]) {
  const choices = new Map(
    events.flatMap((event) => event.rewards.map(({ id, name }) => [id, { id, name }] as const)),
  )
  return {
    minimum: events.length
      ? events.reduce((minimum, event) => Math.min(minimum, event.coins), events[0].coins)
      : 0,
    maximum: events.length
      ? events.reduce((maximum, event) => Math.max(maximum, event.coins), events[0].coins)
      : 0,
    resources: [...choices.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }
}
export function parsePublicEventFilters(
  value: unknown,
): Pick<EventFilters, 'coinsFrom' | 'coinsTo' | 'resources'> {
  if (!value || typeof value !== 'object') throw new Error('Некорректные фильтры.')
  const data = value as Record<string, unknown>
  const result: Pick<EventFilters, 'coinsFrom' | 'coinsTo' | 'resources'> = {}
  for (const key of ['coinsFrom', 'coinsTo'] as const) {
    if (data[key] === undefined) continue
    if (typeof data[key] !== 'number' || !Number.isSafeInteger(data[key]) || data[key] < 0)
      throw new Error('Некорректная граница монет.')
    result[key] = data[key]
  }
  if (
    result.coinsFrom !== undefined &&
    result.coinsTo !== undefined &&
    result.coinsFrom > result.coinsTo
  )
    throw new Error('От не должно превышать До.')
  if (data.resources !== undefined) {
    if (
      !Array.isArray(data.resources) ||
      !data.resources.every((id) => Number.isSafeInteger(id) && id > 0)
    )
      throw new Error('Некорректные предметы.')
    result.resources = [...new Set(data.resources)]
  }
  return result
}
export async function getPublicEventDetail(payload: Payload, slug: string) {
  const result = await payload.find({
    collection: 'events',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: null,
  })
  const doc = result.docs[0]
  if (!doc) return null
  const ids = (doc.launchTimes ?? []).map(idOf)
  const times: { id: number; time: string }[] = []
  if (ids.length)
    for (let page = 1; ; page++) {
      const result = await payload.find({
        collection: 'event-times',
        where: { id: { in: ids } },
        select: { time: true, minutes: true },
        sort: ['minutes', 'id'],
        page,
        limit: 100,
        depth: 0,
        overrideAccess: false,
        user: null,
      })
      times.push(...result.docs.map(({ id, time }) => ({ id, time })))
      if (!result.hasNextPage) break
    }
  return {
    event: (await eventCards(payload, [doc]))[0],
    description: doc.description,
    cooldownMinutes: doc.cooldownMinutes,
    times,
  }
}

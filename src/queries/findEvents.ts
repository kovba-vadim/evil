import type { Payload, PayloadRequest, Where } from 'payload'
import type { Event, EventTime } from '../payload-types'

export interface EventFilters {
  /** Minutes from midnight in server UTC+3; no time-zone conversion. */
  from?: number
  to?: number
  resources?: number[]
  coinsFrom?: number
  coinsTo?: number
}

export interface FindEventsOptions {
  payload: Payload
  filters?: EventFilters
  /** Additional server-side constraint, combined with every event query. */
  where?: Where
  user?: PayloadRequest['user']
  req?: PayloadRequest
  /** Required: the caller must explicitly choose whether to enforce access. */
  overrideAccess: boolean
  /** Optional event ordering; the default remains id. */
  sort?: string | string[]
  /** Transport page size, not a cap on the returned events. */
  pageSize?: number
}

/** Server-side Local API query; does not initialize Payload or expose an endpoint. */
export async function findEvents({
  payload,
  filters = {},
  where: scope = {},
  user,
  req,
  overrideAccess,
  pageSize = 100,
  sort = 'id',
}: FindEventsOptions): Promise<Event[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new RangeError('pageSize must be a positive integer.')
  if (typeof overrideAccess !== 'boolean') throw new TypeError('Choose overrideAccess explicitly.')
  const reader = { payload, user, req, overrideAccess, pageSize, sort }
  const and: Where[] = [scope]
  if (filters.from !== undefined || filters.to !== undefined) {
    const bounds: Where[] = []
    if (filters.from !== undefined) bounds.push({ minutes: { greater_than_equal: filters.from } })
    if (filters.to !== undefined) bounds.push({ minutes: { less_than_equal: filters.to } })
    const crossesMidnight =
      filters.from !== undefined && filters.to !== undefined && filters.from > filters.to
    const times = await readAll(
      reader,
      'event-times',
      crossesMidnight ? { or: bounds } : { and: bounds },
    )
    if (!times.length) return []
    and.push({ launchTimes: { in: times.map(({ id }) => id) } })
  }
  if (filters.coinsFrom !== undefined)
    and.push({ coins: { greater_than_equal: filters.coinsFrom } })
  if (filters.coinsTo !== undefined) and.push({ coins: { less_than_equal: filters.coinsTo } })
  // PostgreSQL 3.92.1 binds repeated rewards.resource predicates to one array row.
  // Query each item separately, intersect event IDs, then paginate the final query.
  let matching: number[] | undefined
  for (const id of new Set(filters.resources ?? [])) {
    const candidates = await readAll(reader, 'events', {
      and: [
        ...and,
        { 'rewards.resource': { equals: id } },
        ...(matching ? [{ id: { in: matching } }] : []),
      ],
    })
    matching = candidates.map(({ id }) => id)
    if (!matching.length) return []
  }
  if (matching) and.push({ id: { in: matching } })
  return readAll(reader, 'events', { and })
}

async function readAll<T extends 'events' | 'event-times'>(
  reader: Pick<FindEventsOptions, 'payload' | 'user' | 'req' | 'overrideAccess'> & {
    pageSize: number
    sort: string | string[]
  },
  collection: T,
  where: Where,
): Promise<(T extends 'events' ? Event : EventTime)[]> {
  const docs: (Event | EventTime)[] = []
  for (let page = 1; ; page++) {
    const result = await reader.payload.find({
      collection,
      where,
      page,
      limit: reader.pageSize,
      sort: collection === 'events' ? reader.sort : 'id',
      depth: 0,
      user: reader.user,
      req: reader.req,
      overrideAccess: reader.overrideAccess,
    })
    docs.push(...result.docs)
    if (!result.hasNextPage) return docs as (T extends 'events' ? Event : EventTime)[]
  }
}

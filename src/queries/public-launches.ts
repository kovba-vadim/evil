import type { Payload, Where } from 'payload'
import { findEvents } from './findEvents'
import { eventCards, parsePublicEventFilters, type PublicEvent } from './public-events'
import {
  expandLaunches,
  launchWindow,
  type LaunchRange,
  type LaunchClock,
} from '../lib/event-launches'
import { isTimeZoneID } from '../lib/time-zones'
export interface ScheduleFilters extends LaunchRange {
  coinsFrom?: number
  coinsTo?: number
  resources?: number[]
}
export async function getPublicSchedule(
  payload: Payload,
  filters: ScheduleFilters,
  now: string,
  { pageSize = 100, where = {} }: { pageSize?: number; where?: Where } = {},
) {
  // Reuse monetary/ALL-reward filtering; select launch instances separately.
  const docs = await findEvents({
    payload,
    filters: {
      coinsFrom: filters.coinsFrom,
      coinsTo: filters.coinsTo,
      resources: filters.resources,
    },
    pageSize,
    where,
    overrideAccess: false,
    user: null,
  })
  const events = await eventCards(payload, docs, pageSize)
  const ids = [
    ...new Set(
      docs.flatMap((doc) =>
        (doc.launchTimes ?? []).map((value) => (typeof value === 'number' ? value : value.id)),
      ),
    ),
  ]
  const times: LaunchClock[] = []
  for (let offset = 0; offset < ids.length; offset += 200)
    for (let page = 1; ; page++) {
      const result = await payload.find({
        collection: 'event-times',
        where: { id: { in: ids.slice(offset, offset + 200) } },
        select: { time: true },
        page,
        limit: pageSize,
        sort: 'id',
        depth: 0,
        overrideAccess: false,
        user: null,
      })
      times.push(...result.docs.map(({ id, time }) => ({ id, time })))
      if (!result.hasNextPage) break
    }
  const lookup = new Map(times.map((time) => [time.id, time])),
    eventMap = new Map(events.map((event) => [event.id, event]))
  const definitions = docs.map((doc) => ({
    event: eventMap.get(doc.id)!,
    times: (doc.launchTimes ?? []).map((value) => {
      const time = lookup.get(typeof value === 'number' ? value : value.id)
      if (!time) throw new Error('Не удалось прочитать время запуска.')
      return time
    }),
  }))
  const { window, notice } = launchWindow(now, filters)
  return {
    now,
    window,
    notice,
    rows: window ? expandLaunches<PublicEvent>(definitions, window) : [],
  }
}
export type PublicSchedule = Awaited<ReturnType<typeof getPublicSchedule>>
export function parseScheduleFilters(value: unknown): ScheduleFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Некорректные фильтры.')
  const data = value as Record<string, unknown>
  if (!isTimeZoneID(data.zone)) throw new Error('Неизвестный часовой пояс.')
  for (const field of ['from', 'to'])
    if (
      data[field] !== undefined &&
      (typeof data[field] !== 'string' ||
        (data[field] !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data[field])))
    )
      throw new Error('Некорректное время.')
  return {
    ...parsePublicEventFilters(data),
    zone: data.zone,
    from: data.from as string | undefined,
    to: data.to as string | undefined,
  }
}

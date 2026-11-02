import { Temporal } from '@js-temporal/polyfill'
import { zoneName, type TimeZoneID } from './time-zones'
export const SERVER_ZONE = '+03:00'
export interface LaunchClock {
  id: number
  time: string
}
export interface LaunchRange {
  zone: TimeZoneID
  from?: string
  to?: string
}
export interface LaunchWindow {
  start: string
  end: string
  mode: 'rolling' | 'range'
}
export function launchWindow(
  now: string,
  { zone, from = '', to = '' }: LaunchRange,
): { window: LaunchWindow | null; notice: string | null } {
  const instant = Temporal.Instant.from(now)
  const rolling: LaunchWindow = {
    start: instant.toString(),
    end: instant.add({ hours: 24 }).toString(),
    mode: 'rolling',
  }
  if (!from || !to)
    return {
      window: rolling,
      notice: from || to ? 'Заполните обе границы времени. Пока показаны ближайшие 24 часа.' : null,
    }
  const localNow = instant.toZonedDateTimeISO(zoneName(zone))
  let date = localNow.toPlainDate()
  try {
    const resolve = (date: Temporal.PlainDate, time: string) =>
      date
        .toPlainDateTime(Temporal.PlainTime.from(time))
        .toZonedDateTime(zoneName(zone), { disambiguation: 'reject' })
    let start = resolve(date, from)
    if (Temporal.Instant.compare(start.toInstant(), instant) < 0) {
      date = date.add({ days: 1 })
      start = resolve(date, from)
    }
    const endDate = to <= from ? date.add({ days: 1 }) : date
    const end = resolve(endDate, to)
    return {
      window: {
        start: start.toInstant().toString(),
        end: end.toInstant().toString(),
        mode: 'range',
      },
      notice: null,
    }
  } catch {
    return {
      window: null,
      notice:
        'Выбранное местное время не существует или встречается дважды при переводе часов. Выберите другие часы или часовой пояс.',
    }
  }
}
export function expandLaunches<T extends { id: number }>(
  events: { event: T; times: LaunchClock[] }[],
  window: LaunchWindow,
): { key: string; instant: string; event: T }[] {
  const start = Temporal.Instant.from(window.start),
    end = Temporal.Instant.from(window.end)
  const first = start.toZonedDateTimeISO(SERVER_ZONE).toPlainDate(),
    last = end.toZonedDateTimeISO(SERVER_ZONE).toPlainDate()
  const rows = new Map<string, { key: string; instant: string; event: T }>()
  for (
    let date = first;
    Temporal.PlainDate.compare(date, last) <= 0;
    date = date.add({ days: 1 })
  ) {
    for (const { event, times } of events)
      for (const time of times) {
        const instant = date
          .toPlainDateTime(Temporal.PlainTime.from(time.time))
          .toZonedDateTime(SERVER_ZONE)
          .toInstant()
        if (
          Temporal.Instant.compare(instant, start) < 0 ||
          Temporal.Instant.compare(instant, end) > 0
        )
          continue
        const key = `${event.id}@${instant.epochMilliseconds}`
        rows.set(key, { key, instant: instant.toString(), event })
      }
  }
  return [...rows.values()].sort(
    (a, b) => Temporal.Instant.compare(a.instant, b.instant) || a.event.id - b.event.id,
  )
}

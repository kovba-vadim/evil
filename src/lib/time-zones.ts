import { Temporal } from '@js-temporal/polyfill'
export const TIME_ZONES = [
  { id: 'server', city: 'Серверное время', zone: '+03:00' },
  { id: 'Europe/London', city: 'Лондон', zone: 'Europe/London' },
  { id: 'Europe/Berlin', city: 'Берлин', zone: 'Europe/Berlin' },
  { id: 'Europe/Paris', city: 'Париж', zone: 'Europe/Paris' },
  { id: 'Europe/Warsaw', city: 'Варшава', zone: 'Europe/Warsaw' },
  { id: 'Europe/Kyiv', city: 'Киев', zone: 'Europe/Kyiv' },
  { id: 'Europe/Vilnius', city: 'Вильнюс', zone: 'Europe/Vilnius' },
  { id: 'Europe/Minsk', city: 'Минск', zone: 'Europe/Minsk' },
  { id: 'Europe/Moscow', city: 'Москва', zone: 'Europe/Moscow' },
  { id: 'Europe/Istanbul', city: 'Стамбул', zone: 'Europe/Istanbul' },
  { id: 'Asia/Tbilisi', city: 'Тбилиси', zone: 'Asia/Tbilisi' },
  { id: 'Asia/Yerevan', city: 'Ереван', zone: 'Asia/Yerevan' },
  { id: 'Asia/Dubai', city: 'Дубай', zone: 'Asia/Dubai' },
  { id: 'Asia/Yekaterinburg', city: 'Екатеринбург', zone: 'Asia/Yekaterinburg' },
  { id: 'Asia/Almaty', city: 'Алматы', zone: 'Asia/Almaty' },
  { id: 'Asia/Novosibirsk', city: 'Новосибирск', zone: 'Asia/Novosibirsk' },
  { id: 'Asia/Bangkok', city: 'Бангкок', zone: 'Asia/Bangkok' },
  { id: 'Asia/Irkutsk', city: 'Иркутск', zone: 'Asia/Irkutsk' },
  { id: 'Asia/Vladivostok', city: 'Владивосток', zone: 'Asia/Vladivostok' },
  { id: 'Asia/Seoul', city: 'Сеул', zone: 'Asia/Seoul' },
  { id: 'America/New_York', city: 'Нью-Йорк', zone: 'America/New_York' },
  { id: 'America/Los_Angeles', city: 'Лос-Анджелес', zone: 'America/Los_Angeles' },
] as const
export type TimeZoneID = (typeof TIME_ZONES)[number]['id']
export const TIME_ZONE_STORAGE_KEY = 'evilisland-time-zone'
export function isTimeZoneID(value: unknown): value is TimeZoneID {
  return TIME_ZONES.some((zone) => zone.id === value)
}
export function normalizeTimeZone(value: unknown): TimeZoneID {
  return isTimeZoneID(value) ? value : 'server'
}
export function zoneName(id: TimeZoneID) {
  return TIME_ZONES.find((zone) => zone.id === id)!.zone
}
export function offsetLabel(offset: string) {
  const [hours, minutes] = offset.slice(1).split(':')
  return `UTC${offset[0]}${Number(hours)}${minutes === '00' ? '' : ':' + minutes}`
}
export function timeZoneLabel(id: TimeZoneID, now: string) {
  if (id === 'server') return 'Серверное время — UTC+3'
  const zone = TIME_ZONES.find((zone) => zone.id === id)!
  return `${zone.city} — ${offsetLabel(Temporal.Instant.from(now).toZonedDateTimeISO(zone.zone).offset)}`
}
export function formatLaunch(instant: string, zone: TimeZoneID, now: string) {
  const local = Temporal.Instant.from(instant).toZonedDateTimeISO(zoneName(zone))
  const today = Temporal.Instant.from(now).toZonedDateTimeISO(zoneName(zone)).toPlainDate()
  const date = local.toPlainDate(),
    difference = today.until(date).days
  const prefix =
    difference === 0 ? 'Сегодня' : difference === 1 ? 'Завтра' : difference === -1 ? 'Вчера' : ''
  return {
    time: local.toPlainTime().toString({ smallestUnit: 'minute' }),
    date: `${prefix ? prefix + ', ' : ''}${date.toString()}`,
    offset: offsetLabel(local.offset),
  }
}

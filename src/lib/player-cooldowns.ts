import { formatLaunch, normalizeTimeZone } from './time-zones'
export const COOLDOWN_CHANGED_EVENT = 'evil-player-cooldown-changed'
export const QUEST_COOLDOWN_CHANGED_EVENT = 'evil-player-quest-cooldown-changed'

export type PersonalCooldown = {
  id: number
  eventID: number
  name: string
  slug: string
  completedAt: string
  cooldownUntil: string
  cancelled: boolean
  revision: string
}
export type CooldownSnapshot = { playerID: number; serverNow: string; records: PersonalCooldown[] }
export type QuestCooldownSnapshot = Omit<CooldownSnapshot, 'records'> & {
  records: (Omit<PersonalCooldown, 'eventID'> & { questID: number })[]
}
export function cooldownEnd(completedAt: string, minutes: unknown) {
  // Missing legacy values explicitly mean no personal cooldown, as does zero.
  if (minutes === null || minutes === undefined) minutes = 0
  if (typeof minutes !== 'number' || !Number.isSafeInteger(minutes) || minutes < 0)
    throw new Error('Некорректный КД ивента.')
  const epoch = Date.parse(completedAt) + minutes * 60_000
  if (!Number.isSafeInteger(epoch) || epoch > 8_640_000_000_000_000)
    throw new Error('КД ивента превышает поддерживаемый диапазон.')
  return new Date(epoch).toISOString()
}
export function remainingCooldown(until: string, now: string) {
  const seconds = Math.max(0, Math.ceil((Date.parse(until) - Date.parse(now)) / 1000))
  const days = Math.floor(seconds / 86400),
    hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60),
    rest = seconds % 60
  return `${days ? `${days} д. ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}
export function cooldownDate(until: string, zone: string, now: string) {
  const value = formatLaunch(until, normalizeTimeZone(zone), now)
  return `${value.date}, ${value.time} (${value.offset})`
}

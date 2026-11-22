import { expandLaunches, type LaunchClock } from './event-launches'
import { cooldownDate } from './player-cooldowns'
import { eventEndAt, launchEligible } from './launch-eligibility'

export type ReminderKind = 'once' | 'regular'
export type LaunchProposal = { launchAt: string; remindAt: string }
export type PlayPeriod = { startedAt: string; endsAt: string; revision: string }
export type ReminderView = {
  id: number
  eventID: number | null
  name: string
  slug: string | null
  kind: ReminderKind
  leadMinutes: number
  includeCooldown: boolean
  enabled: boolean
  revision: string
  proposal: LaunchProposal | null
  status:
    'scheduled' | 'past' | 'invalid' | 'waiting' | 'disabled' | 'no-launch' | 'cooldown-blocked'
  cooldownUntil: string | null
}
export type ReminderSnapshot = {
  playerID: number
  serverNow: string
  play: PlayPeriod | null
  reminders: ReminderView[]
}
export type ReminderPreview = {
  proposal: LaunchProposal | null
  revision: string | null
  cooldownUntil: string | null
  serverNow: string
  reason: string | null
}
export const DELIVERY_NOTICE = 'Настройки сохранены. Отправка сообщений пока не подключена'
export function validLead(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 120
}
export function playingAt(play: PlayPeriod | null, now: string) {
  return (
    !!play &&
    Date.parse(play.startedAt) <= Date.parse(now) &&
    Date.parse(now) < Date.parse(play.endsAt)
  )
}
export function nextReminder(
  times: LaunchClock[],
  lead: number,
  now: string,
  durationMinutes: number,
  cooldownUntil: string | null,
  play?: PlayPeriod | null,
): LaunchProposal | null {
  if (!validLead(lead))
    throw new Error('Предупреждение должно быть целым числом от 1 до 120 минут.')
  if (!times.length || play === null || (play && !playingAt(play, now))) return null
  const warningStart = Math.max(Date.parse(now) + 1, play ? Date.parse(play.startedAt) : 0)
  // Skip whole days for a long cooldown rather than imposing a 24-hour eligibility cap.
  eventEndAt(now, durationMinutes)
  const cooldownStart =
    cooldownUntil && Date.parse(cooldownUntil) > Date.parse(now)
      ? Date.parse(cooldownUntil) - durationMinutes * 60_000 + 1
      : 0
  const start = Math.max(warningStart + lead * 60_000, cooldownStart)
  const end = play ? Date.parse(play.endsAt) - 1 : start + 24 * 60 * 60_000
  if (start > end) return null
  const row = expandLaunches([{ event: { id: 1 }, times }], {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    mode: 'rolling',
  }).find((row) => launchEligible(row.instant, durationMinutes, cooldownUntil, now))
  return row
    ? {
        launchAt: row.instant,
        remindAt: new Date(Date.parse(row.instant) - lead * 60_000).toISOString(),
      }
    : null
}
export function launchStillExists(times: LaunchClock[], instant: string) {
  return (
    expandLaunches([{ event: { id: 1 }, times }], { start: instant, end: instant, mode: 'range' })
      .length > 0
  )
}
export function reminderMessage(
  name: string,
  proposal: LaunchProposal,
  include: boolean,
  cooldownUntil: string | null,
  now: string,
  zone: string,
) {
  let text = `${name} начнётся ${cooldownDate(proposal.launchAt, zone, now)}.`
  if (!include) return text
  if (!cooldownUntil || Date.parse(cooldownUntil) <= Date.parse(now))
    return `${text} Активного КД нет.`
  text += ` Ваш КД закончится ${cooldownDate(cooldownUntil, zone, now)}.`
  const delta = Date.parse(cooldownUntil) - Date.parse(proposal.launchAt)
  return delta > 0
    ? `${text} Это примерно на ${Math.ceil(delta / 60_000)} мин. после начала. Если ивент ещё будет доступен, сможете попробовать зайти.`
    : `${text} К запуску КД закончится. Наличие и занятость ивента сайт не знает.`
}

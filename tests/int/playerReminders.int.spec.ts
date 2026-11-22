import { describe, expect, it } from 'vitest'
import {
  launchStillExists,
  nextReminder,
  playingAt,
  reminderMessage,
  validLead,
} from '../../src/lib/player-reminders'

const times = [
  { id: 1, time: '18:25' },
  { id: 2, time: '19:00' },
]
const now = '2026-11-14T15:18:00.000Z' // 18:18 UTC+3
describe('reminder schedule and preview', () => {
  it('skips an already missed warning without sending immediately', () => {
    expect(nextReminder(times, 10, now, 30, null)).toEqual({
      launchAt: '2026-11-14T16:00:00Z',
      remindAt: '2026-11-14T15:50:00.000Z',
    })
    expect(nextReminder(times, 5, now, 30, null)?.launchAt).toBe('2026-11-14T15:25:00Z')
  })
  it('crosses midnight using server UTC+3 and preserves concrete instants', () => {
    expect(nextReminder([{ id: 1, time: '00:05' }], 10, '2026-11-14T20:50:00Z', 30, null)).toEqual({
      launchAt: '2026-11-14T21:05:00Z',
      remindAt: '2026-11-14T20:55:00.000Z',
    })
    expect(
      nextReminder([{ id: 1, time: '00:05' }], 10, '2026-11-14T20:59:00Z', 30, null)?.launchAt,
    ).toBe('2026-11-15T21:05:00Z')
    expect(launchStillExists(times, '2026-11-14T15:25:00Z')).toBe(true)
    expect(launchStillExists(times.slice(1), '2026-11-14T15:25:00Z')).toBe(false)
  })
  it('requires both warning and launch inside the current play period and never catches up', () => {
    const play = { startedAt: now, endsAt: '2026-11-14T16:00:00Z', revision: 'v1' }
    expect(nextReminder(times, 10, now, 30, null, play)).toBeNull() // launch exactly at expired boundary
    expect(nextReminder(times, 5, now, 30, null, play)?.launchAt).toBe('2026-11-14T15:25:00Z')
    expect(nextReminder(times, 5, '2026-11-14T15:21:00Z', 30, null, play)).toBeNull()
    expect(playingAt(play, play.endsAt)).toBe(false)
    expect(nextReminder(times, 10, now, 30, null, null)).toBeNull()
    expect(nextReminder([], 10, now, 30, null)).toBeNull()
  })
  it('validates warning minutes', () => {
    for (const value of [1, 5, 10, 120]) expect(validLead(value)).toBe(true)
    for (const value of [0, 121, 1.5, '10', null]) expect(validLead(value)).toBe(false)
  })
  it('previews current cooldown before/after launch, no cooldown and a disabled checkbox', () => {
    const proposal = nextReminder(times, 5, now, 30, null)!
    expect(
      reminderMessage('Ивент', proposal, true, '2026-11-14T15:30:00Z', now, 'Europe/London'),
    ).toContain('на 5 мин. после начала')
    expect(
      reminderMessage('Ивент', proposal, true, '2026-11-14T15:23:00Z', now, 'server'),
    ).toContain('К запуску КД закончится')
    expect(reminderMessage('Ивент', proposal, true, null, now, 'server')).toContain(
      'Активного КД нет',
    )
    expect(
      reminderMessage('Ивент', proposal, true, '2026-11-14T15:10:00Z', now, 'server'),
    ).toContain('Активного КД нет')
    const hidden = reminderMessage('Ивент', proposal, false, '2026-11-14T15:30:00Z', now, 'server')
    expect(hidden).not.toContain('КД')
    expect(hidden).toContain('18:25')
    expect(reminderMessage('Ивент', proposal, false, null, now, 'Europe/London')).toContain('15:25')
  })
})

import { expect, it } from 'vitest'
import { eventEndAt, launchEligible } from '../../src/lib/launch-eligibility'
import { nextReminder } from '../../src/lib/player-reminders'

const now = '2026-11-14T10:00:00Z',
  start = '2026-11-14T11:00:00Z' // 14:00 UTC+3
it('compares exact instants before start, inside, exactly at the end and beyond it', () => {
  for (const until of [
    null,
    '2026-11-14T10:50:00Z',
    '2026-11-14T11:05:00Z',
    '2026-11-14T11:29:59.999Z',
  ])
    expect(launchEligible(start, 30, until, now)).toBe(true)
  for (const until of ['2026-11-14T11:30:00Z', '2026-11-14T11:30:00.001Z', '2026-11-14T12:00:00Z'])
    expect(launchEligible(start, 30, until, now)).toBe(false)
  expect(launchEligible(start, 30, now, now)).toBe(true)
  expect(eventEndAt('2026-11-14T20:50:00Z', 30)).toBe('2026-11-14T21:20:00.000Z')
})
it('skips blocked regular launches while only the start and warning must fit the play period', () => {
  const times = [
    { id: 1, time: '14:00' },
    { id: 2, time: '14:30' },
  ]
  const play = { startedAt: now, endsAt: '2026-11-14T11:31:00Z', revision: 'v1' }
  expect(nextReminder(times, 10, now, 30, '2026-11-14T11:30:00Z', play)?.launchAt).toBe(
    '2026-11-14T11:30:00Z',
  )
  expect(nextReminder(times, 10, now, 30, '2026-11-14T12:00:00Z', play)).toBeNull()
  expect(nextReminder(times, 10, now, 120, '2026-11-14T12:00:00Z', play)?.launchAt).toBe(
    '2026-11-14T11:00:00Z',
  )
})
it('finds a once launch beyond 24 hours for a long cooldown without rounding', () => {
  expect(
    nextReminder([{ id: 1, time: '14:00' }], 10, now, 30, '2026-11-17T11:30:00.000Z')?.launchAt,
  ).toBe('2026-11-18T11:00:00Z')
  expect(
    nextReminder([{ id: 1, time: '14:00' }], 10, now, 30, '2026-11-17T11:29:59.999Z')?.launchAt,
  ).toBe('2026-11-17T11:00:00Z')
  for (const duration of [0, -1, 1.5, NaN]) expect(() => eventEndAt(start, duration)).toThrow()
})

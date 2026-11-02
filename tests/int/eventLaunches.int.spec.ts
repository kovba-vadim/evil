import { describe, it, expect } from 'vitest'
import { expandLaunches, launchWindow } from '../../src/lib/event-launches'
import {
  formatLaunch,
  timeZoneLabel,
  normalizeTimeZone,
  TIME_ZONES,
} from '../../src/lib/time-zones'
const definitions = [
  {
    event: { id: 1 },
    times: [
      { id: 1, time: '23:00' },
      { id: 2, time: '00:00' },
      { id: 3, time: '01:00' },
      { id: 4, time: '22:59' },
      { id: 5, time: '01:01' },
    ],
  },
]
describe('deterministic launch instances and time zones', () => {
  it('builds actual UTC+3 instants across midnight with both range endpoints included', () => {
    const { window } = launchWindow('2026-01-01T18:00:00Z', {
      zone: 'server',
      from: '23:00',
      to: '01:00',
    })
    expect(window).toEqual({
      start: '2026-01-01T20:00:00Z',
      end: '2026-01-01T22:00:00Z',
      mode: 'range',
    })
    expect(expandLaunches(definitions, window!).map((row) => row.instant)).toEqual([
      '2026-01-01T20:00:00Z',
      '2026-01-01T21:00:00Z',
      '2026-01-01T22:00:00Z',
    ])
    expect(formatLaunch('2026-01-01T21:00:00Z', 'server', '2026-01-01T18:00:00Z')).toEqual({
      date: 'Завтра, 2026-01-02',
      time: '00:00',
      offset: 'UTC+3',
    })
  })
  it('moves a passed range start to tomorrow, but includes a start exactly now', () => {
    expect(
      launchWindow('2026-01-01T20:00:00Z', { zone: 'server', from: '23:00', to: '01:00' }).window
        ?.start,
    ).toBe('2026-01-01T20:00:00Z')
    expect(
      launchWindow('2026-01-01T20:00:01Z', { zone: 'server', from: '23:00', to: '01:00' }).window
        ?.start,
    ).toBe('2026-01-02T20:00:00Z')
  })
  it('uses elapsed 24 hours by default and ignores an incomplete range with a hint', () => {
    const result = launchWindow('2026-03-29T00:00:00Z', { zone: 'Europe/Berlin', from: '04:00' })
    expect(result.notice).toContain('обе границы')
    expect(result.window).toEqual({
      start: '2026-03-29T00:00:00Z',
      end: '2026-03-30T00:00:00Z',
      mode: 'rolling',
    })
    expect(launchWindow('2026-03-29T00:00:00Z', { zone: 'Europe/Berlin' }).notice).toBeNull()
  })
  it('treats equal clocks as a full local day and deduplicates only identical event instants', () => {
    const window = launchWindow('2026-01-01T21:00:00Z', {
      zone: 'server',
      from: '00:00',
      to: '00:00',
    }).window!
    expect(Date.parse(window.end) - Date.parse(window.start)).toBe(24 * 3600000)
    const rows = expandLaunches(
      [
        {
          event: { id: 1 },
          times: [
            { id: 1, time: '00:00' },
            { id: 1, time: '00:00' },
            { id: 2, time: '12:00' },
          ],
        },
        { event: { id: 2 }, times: [{ id: 1, time: '00:00' }] },
      ],
      window,
    )
    expect(rows).toHaveLength(5) // inclusive boundaries are different dated instances, never duplicate keys
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
    expect(rows.filter((row) => row.event.id === 1)).toHaveLength(3)
  })
  it.each([
    ['2026-03-28T23:00:00Z', 23],
    ['2026-10-24T22:00:00Z', 25],
  ] as const)('uses local calendar days through DST at %s', (now, hours) => {
    const window = launchWindow(now, { zone: 'Europe/Berlin', from: '00:00', to: '00:00' }).window!
    expect((Date.parse(window.end) - Date.parse(window.start)) / 3600000).toBe(hours)
  })
  it.each([
    ['2026-03-28T22:00:00Z', '02:30', '04:00'],
    ['2026-10-24T22:00:00Z', '02:30', '04:00'],
    ['2026-03-29T00:00:00Z', '01:00', '02:30'],
    ['2026-10-24T23:00:00Z', '01:00', '02:30'],
  ])('rejects missing/ambiguous wall time at %s %s–%s', (now, from, to) => {
    const result = launchWindow(now, { zone: 'Europe/Berlin', from, to })
    expect(result.window).toBeNull()
    expect(result.notice).toContain('не существует или встречается дважды')
  })
  it('formats repeated city hours as different instants and offsets, without changing the fixed server zone', () => {
    const first = formatLaunch('2026-10-25T00:30:00Z', 'Europe/Berlin', '2026-10-24T22:00:00Z')
    const second = formatLaunch('2026-10-25T01:30:00Z', 'Europe/Berlin', '2026-10-24T22:00:00Z')
    expect(first.time).toBe('02:30')
    expect(second.time).toBe('02:30')
    expect(first.offset).toBe('UTC+2')
    expect(second.offset).toBe('UTC+1')
    expect(timeZoneLabel('server', '2026-07-01T00:00:00Z')).toBe('Серверное время — UTC+3')
    expect(timeZoneLabel('Europe/Berlin', '2026-07-01T00:00:00Z')).toContain('UTC+2')
    expect(timeZoneLabel('Europe/Berlin', '2026-01-01T00:00:00Z')).toContain('UTC+1')
  })
  it('reinterprets the same wall clocks in the selected zone', () => {
    const now = '2026-01-01T00:00:00Z'
    expect(launchWindow(now, { zone: 'server', from: '23:00', to: '01:00' }).window?.start).toBe(
      '2026-01-01T20:00:00Z',
    )
    expect(
      launchWindow(now, { zone: 'Europe/Berlin', from: '23:00', to: '01:00' }).window?.start,
    ).toBe('2026-01-01T22:00:00Z')
  })
  it('is independent from the default process time zone and validates the shared zone catalog', () => {
    const original = process.env.TZ,
      results = []
    try {
      for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
        process.env.TZ = zone
        results.push(
          expandLaunches(
            definitions,
            launchWindow('2026-01-01T18:00:00Z', {
              zone: 'Europe/Berlin',
              from: '23:00',
              to: '01:00',
            }).window!,
          ),
        )
      }
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
    expect(results[1]).toEqual(results[0])
    expect(results[2]).toEqual(results[0])
    expect(normalizeTimeZone('unknown')).toBe('server')
    for (const zone of TIME_ZONES)
      expect(timeZoneLabel(zone.id, '2026-07-01T00:00:00Z')).toContain('UTC')
  })
})

import { describe, expect, it } from 'vitest'
import { deriveEventMinutes, timeToMinutes } from '../../src/hooks/eventTimes'

// No Payload instance, database connection or writes: only the pure conversion and hook.
type HookArgs = Parameters<typeof deriveEventMinutes>[0]
const args = (data: HookArgs['data'], originalDoc?: HookArgs['originalDoc']) =>
  ({ data, originalDoc }) as unknown as HookArgs

describe('daily server time without a calendar date', () => {
  it.each([
    ['00:00', 0],
    ['05:25', 325],
    ['09:55', 595],
    ['23:59', 1439],
  ])('%s maps to %i minutes', (time, minutes) => {
    expect(timeToMinutes(time)).toBe(minutes)
  })

  it.each([
    '24:00',
    '12:60',
    '5:25',
    '05:25:00',
    ' 05:25',
    '05:25\n',
    '',
    '2026-11-01T05:25:00+03:00',
    null,
  ])('rejects invalid daily time %s', (time) => {
    expect(timeToMinutes(time)).toBeUndefined()
  })

  it('overwrites inconsistent API minutes with the derived value', () => {
    expect(deriveEventMinutes(args({ time: '05:25', minutes: 999 }))).toMatchObject({
      time: '05:25',
      minutes: 325,
    })
  })

  it('recomputes from the saved time on a minutes-only PATCH', () => {
    const original = { id: 1, time: '23:59', minutes: 1439 } as HookArgs['originalDoc']
    expect(deriveEventMinutes(args({ minutes: 0 }, original))).toMatchObject({
      time: '23:59',
      minutes: 1439,
    })
  })

  it('rejects invalid time before required field validation', () => {
    expect(() => deriveEventMinutes(args({ time: '24:00' }))).toThrow()
  })
})

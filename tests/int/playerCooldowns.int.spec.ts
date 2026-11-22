import { describe, expect, it } from 'vitest'
import { cooldownDate, cooldownEnd, remainingCooldown } from '../../src/lib/player-cooldowns'

describe('personal cooldown timestamps', () => {
  const start = '2026-11-14T10:00:00.000Z'
  it('uses event minutes, with explicit zero/missing semantics and bounds', () => {
    expect(cooldownEnd(start, 90)).toBe('2026-11-14T11:30:00.000Z')
    for (const value of [0, null, undefined]) expect(cooldownEnd(start, value)).toBe(start)
    for (const value of [-1, 1.5, '60', NaN, Number.MAX_SAFE_INTEGER])
      expect(() => cooldownEnd(start, value)).toThrow()
  })
  it('computes remaining time from the end rather than accumulated timer ticks', () => {
    expect(remainingCooldown('2026-11-15T11:01:02Z', start)).toBe('1 д. 01:01:02')
    expect(remainingCooldown(start, '2026-11-14T10:00:01Z')).toBe('00:00:00')
  })
  it('uses the saved player timezone without shifting the stored instant', () => {
    expect(cooldownDate(start, 'Europe/London', start)).toContain('10:00 (UTC+0)')
    expect(cooldownDate(start, 'server', start)).toContain('13:00 (UTC+3)')
    expect(cooldownDate('2026-07-14T10:00:00Z', 'Europe/London', '2026-07-14T00:00:00Z')).toContain(
      '11:00 (UTC+1)',
    )
  })
})

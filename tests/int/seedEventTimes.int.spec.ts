import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { EVENT_TIMES, seedEventTimes, validateEventTimes } from '../../scripts/seed-event-times'

function fakePayload(initial: string[] = []) {
  const times = new Set(initial)
  const find = vi.fn(async (args) => ({
    docs: times.has(args.where.time.equals) ? [{ id: 1, time: args.where.time.equals }] : [],
  }))
  const create = vi.fn(async (args) => {
    expect(times.has(args.data.time)).toBe(false)
    times.add(args.data.time)
    return { id: times.size, time: args.data.time }
  })
  return {
    times,
    find,
    create,
    payload: { find, create } as unknown as Pick<Payload, 'find' | 'create'>,
  }
}

describe('event time seed without database access', () => {
  it('validates all 111 literal server times and excludes restart time', () => {
    expect(() => validateEventTimes(EVENT_TIMES)).not.toThrow()
    expect(EVENT_TIMES).toHaveLength(111)
    expect(new Set(EVENT_TIMES).size).toBe(111)
    expect(EVENT_TIMES).not.toContain('05:00')
    expect(EVENT_TIMES.filter((time) => time.startsWith('05:'))).toEqual([
      '05:25',
      '05:30',
      '05:55',
    ])
    for (const times of [
      EVENT_TIMES.slice(1),
      [...EVENT_TIMES.slice(0, -1), EVENT_TIMES[0]],
      [...EVENT_TIMES.slice(0, -1), '24:00'],
      EVENT_TIMES.map((time) => (time === '05:25' ? '05:00' : time)),
      [...EVENT_TIMES].reverse(),
    ])
      expect(() => validateEventTimes(times)).toThrow()
  })

  it('previews without writing, creates only missing times and is idempotent', async () => {
    const fake = fakePayload(['00:00', '05:25', '05:00', '04:55'])
    expect(await seedEventTimes(fake.payload)).toEqual({ existing: 2, missing: 109, created: 0 })
    expect(fake.create).not.toHaveBeenCalled()
    expect(await seedEventTimes(fake.payload, true)).toEqual({
      existing: 2,
      missing: 109,
      created: 109,
    })
    expect(fake.times.size).toBe(113)
    expect(fake.times.has('05:00')).toBe(true)
    expect(fake.times.has('04:55')).toBe(true)
    expect(await seedEventTimes(fake.payload, true)).toEqual({
      existing: 111,
      missing: 0,
      created: 0,
    })
    expect(fake.create).toHaveBeenCalledTimes(109)
    expect(
      fake.create.mock.calls.every(
        ([args]) =>
          args.collection === 'event-times' &&
          args.overrideAccess === true &&
          Object.keys(args.data).sort().join(',') === 'minutes,time',
      ),
    ).toBe(true)
    expect(
      fake.find.mock.calls.every(
        ([args]) =>
          args.collection === 'event-times' && args.overrideAccess === true && args.limit === 1,
      ),
    ).toBe(true)
  })

  it('stops on a write failure and resumes by skipping previously created times', async () => {
    const fake = fakePayload()
    fake.create
      .mockImplementationOnce(async (args) => {
        fake.times.add(args.data.time)
        return { id: 1, time: args.data.time }
      })
      .mockRejectedValueOnce(new Error('Unavailable'))
    await expect(seedEventTimes(fake.payload, true)).rejects.toThrow('Unavailable')
    expect(fake.times.size).toBe(1)
    expect(await seedEventTimes(fake.payload, true)).toEqual({
      existing: 1,
      missing: 110,
      created: 110,
    })
  })
})

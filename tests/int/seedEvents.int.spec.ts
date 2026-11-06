import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import {
  EVENT_SCHEDULE,
  planEvents,
  seedEvents,
  validateEventSchedule,
} from '../../scripts/seed-events'
import { EVENT_TIMES } from '../../scripts/seed-event-times'

describe('event schedule without database access', () => {
  it('matches the 14 schedules and 111 unique server times', () => {
    expect(() => validateEventSchedule()).not.toThrow()
    expect(EVENT_SCHEDULE.map((event) => event.times.length)).toEqual([
      8, 8, 8, 8, 9, 8, 8, 8, 8, 8, 8, 8, 7, 7,
    ])
    expect(EVENT_SCHEDULE[4].times).toContain('23:05')
    expect(EVENT_SCHEDULE[12].times).not.toContain('04:55')
    expect(EVENT_SCHEDULE[13].times).not.toContain('05:00')
    const bad = EVENT_SCHEDULE.map((event) => ({ ...event, times: [...event.times] }))
    bad[0].times.push(bad[0].times[0])
    expect(() => validateEventSchedule(bad)).toThrow()
    expect(() => validateEventSchedule([...EVENT_SCHEDULE, EVENT_SCHEDULE[0]])).toThrow()
  })

  it('reads every time page, maps IDs, preserves old links and never writes in preview', async () => {
    const times = EVENT_TIMES.map((time, index) => ({ id: index + 100, time }))
    const find = vi.fn(async (args) => {
      if (args.collection === 'event-times')
        return {
          docs: args.page === 1 ? times.slice(0, 100) : times.slice(100),
          hasNextPage: args.page === 1,
        }
      return {
        docs:
          args.where.or[0].name.equals === EVENT_SCHEDULE[0].name
            ? [
                {
                  id: 1,
                  launchTimes: [{ id: 999 }, times.find((time) => time.time === '02:25')!.id],
                },
              ]
            : [],
        hasNextPage: false,
      }
    })
    const create = vi.fn(),
      update = vi.fn()
    const plan = await seedEvents({ find, create, update } as unknown as Payload)
    expect(plan).toMatchObject({ newEvents: 13, existingEvents: 1, missingLinks: 110 })
    expect(plan.changes[0].launchTimes).toContain(999)
    for (const [index, change] of plan.changes.entries()) {
      for (const time of EVENT_SCHEDULE[index].times) {
        expect(change.launchTimes).toContain(times.find((doc) => doc.time === time)!.id)
      }
      expect(new Set(change.launchTimes).size).toBe(change.launchTimes.length)
    }
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects missing times and ambiguous names/slugs before any write', async () => {
    const find = vi.fn(async (args) => ({
      docs:
        args.collection === 'event-times'
          ? EVENT_TIMES.slice(0, -1).map((time, id) => ({ id, time }))
          : [],
      hasNextPage: false,
    }))
    await expect(planEvents({ find } as unknown as Payload)).rejects.toThrow('23:55')
    find.mockImplementation(async (args) => ({
      docs:
        args.collection === 'event-times'
          ? EVENT_TIMES.map((time, id) => ({ id, time }))
          : [
              { id: 1, time: '' },
              { id: 2, time: '' },
            ],
      hasNextPage: false,
    }))
    await expect(planEvents({ find } as unknown as Payload)).rejects.toThrow(
      'Неоднозначное совпадение',
    )
  })
})

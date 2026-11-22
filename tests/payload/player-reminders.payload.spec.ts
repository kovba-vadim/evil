import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { Event, Player } from '../../src/payload-types'
import { openTestPayload } from '../helpers/testDatabase'
import {
  getPlayerReminders,
  mutatePlayerReminders,
  previewReminder,
  ReminderConflict,
  type ReminderAction,
} from '../../src/queries/player-reminders'
import { reminderWriteCapability } from '../../src/access/player-reminders'
import { cooldownWriteCapability } from '../../src/access/player-cooldowns'

let api: Payload
let player: Player & { collection: 'players' }
let other: Player & { collection: 'players' }
const events: Event[] = [],
  ownedTimes: number[] = []
const baseNow = '2026-11-14T15:18:00.000Z'
const context = { reminderWrite: reminderWriteCapability }
const requestID = () => crypto.randomUUID()
beforeAll(async () => {
  api = await openTestPayload()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(baseNow)
  for (let i = 0; i < 2; i++) {
    const doc = await api.create({
      collection: 'players',
      overrideAccess: true,
      disableVerificationEmail: true,
      data: {
        email: `${requestID()}@example.test`,
        password: requestID(),
        nickname: 'Напоминания',
        timeZone: 'Europe/London',
        _verified: true,
      },
    })
    if (i === 0) player = { ...doc, collection: 'players' }
    else other = { ...doc, collection: 'players' }
  }
  const times: number[] = []
  for (const time of ['18:25', '19:00', '23:00']) {
    let doc = (
      await api.find({
        collection: 'event-times',
        where: { time: { equals: time } },
        overrideAccess: true,
      })
    ).docs[0]
    if (!doc) {
      doc = await api.create({
        collection: 'event-times',
        overrideAccess: true,
        data: { time, minutes: 0 },
      })
      ownedTimes.push(doc.id)
    }
    times.push(doc.id)
  }
  for (const ids of [times.slice(0, 2), times.slice(2), []])
    events.push(
      await api.create({
        collection: 'events',
        overrideAccess: true,
        data: {
          name: `Напоминания ${requestID()}`,
          slug: `reminder-${requestID()}`,
          coins: 0,
          durationMinutes: 30,
          cooldownMinutes: 10,
          launchTimes: ids,
        },
      }),
    )
})
afterAll(async () => {
  vi.useRealTimers()
  try {
    if (player && other)
      for (const collection of ['player-event-reminders', 'player-play-sessions'] as const)
        await api.delete({
          collection,
          overrideAccess: true,
          context,
          where: { player: { in: [player.id, other.id] } },
        })
    if (player)
      await api.delete({
        collection: 'player-event-cooldowns',
        overrideAccess: true,
        context: { cooldownWrite: cooldownWriteCapability },
        where: { player: { in: [player.id, other.id] } },
      })
    for (const event of events)
      await api.delete({ collection: 'events', id: event.id, overrideAccess: true })
    for (const id of ownedTimes)
      await api.delete({ collection: 'event-times', id, overrideAccess: true })
    for (const actor of [player, other])
      if (actor) await api.delete({ collection: 'players', id: actor.id, overrideAccess: true })
  } finally {
    await api?.destroy()
  }
})
const save = async (kind: 'regular', actor = player, event = events[0], lead = 10) => {
  const preview = await previewReminder(api, actor, event.id, kind, lead)
  const action: ReminderAction = {
    action: 'save',
    eventID: event.id,
    kind,
    leadMinutes: lead,
    includeCooldown: true,
    enabled: true,
    launchAt: null,
    revision: preview.revision,
    requestID: requestID(),
  }
  return { action, preview }
}

describe('reminders and play mode through Payload on isolated PostgreSQL', () => {
  it('preserves legacy once rows, serializes retries and enforces regular uniqueness', async () => {
    const legacy = await api.create({
      collection: 'player-event-reminders',
      context,
      overrideAccess: true,
      data: {
        player: player.id,
        event: events[0].id,
        kind: 'once',
        leadMinutes: 10,
        includeCooldown: true,
        enabled: true,
        revision: requestID(),
        requestID: requestID(),
        launchAt: '2026-11-14T16:00:00.000Z',
        remindAt: '2026-11-14T15:50:00.000Z',
      },
    })
    const { action } = await save('regular')
    const results = await Promise.all(
      Array.from({ length: 5 }, () => mutatePlayerReminders(api, player, action)),
    )
    expect(results[0].reminders[0].proposal).toBeNull()
    expect(new Set(results.map((value) => value.reminders[0].revision)).size).toBe(1)
    const snapshot = results[0]
    expect(snapshot.reminders).toHaveLength(1)
    expect(snapshot.play).toBeNull()
    expect(snapshot.reminders[0].status).toBe('waiting')
    await mutatePlayerReminders(api, player, {
      action: 'delete',
      id: legacy.id,
      revision: legacy.revision,
      requestID: requestID(),
    })
    expect(
      await api.findByID({
        collection: 'player-event-reminders',
        id: legacy.id,
        context,
        overrideAccess: true,
        depth: 0,
      }),
    ).toMatchObject({
      kind: 'once',
      enabled: legacy.enabled,
      launchAt: legacy.launchAt,
      remindAt: legacy.remindAt,
      revision: legacy.revision,
      updatedAt: legacy.updatedAt,
    })
    await expect(
      api.create({
        collection: 'player-event-reminders',
        context,
        overrideAccess: true,
        data: {
          player: player.id,
          event: events[0].id,
          kind: 'regular',
          leadMinutes: 10,
          includeCooldown: true,
          enabled: true,
          revision: requestID(),
          requestID: requestID(),
        },
      }),
    ).rejects.toThrow()
  })
  it('starts, extends from the current end exactly once, expires without a job and preserves subscriptions', async () => {
    const started = await mutatePlayerReminders(api, player, {
      action: 'play',
      operation: 'start',
      hours: 4,
      revision: null,
      requestID: requestID(),
    })
    expect(started.play?.endsAt).toBe('2026-11-14T19:18:00.000Z')
    expect(started.reminders.find((row) => row.kind === 'regular')?.proposal?.launchAt).toBe(
      '2026-11-14T16:00:00Z',
    )
    const extension: ReminderAction = {
      action: 'play',
      operation: 'extend',
      hours: 2,
      revision: started.play!.revision,
      requestID: requestID(),
    }
    const concurrent = await Promise.all(
      Array.from({ length: 5 }, () => mutatePlayerReminders(api, player, extension)),
    )
    expect(concurrent.every((value) => value.play?.endsAt === '2026-11-14T21:18:00.000Z')).toBe(
      true,
    )
    vi.setSystemTime('2026-11-14T21:18:00Z')
    try {
      expect(
        (await getPlayerReminders(api, player)).reminders.find((row) => row.kind === 'regular')
          ?.status,
      ).toBe('waiting')
      await expect(
        mutatePlayerReminders(api, player, {
          ...extension,
          requestID: requestID(),
          revision: concurrent[0].play!.revision,
        }),
      ).rejects.toBeInstanceOf(ReminderConflict)
      const restarted = await mutatePlayerReminders(api, player, {
        action: 'play',
        operation: 'start',
        hours: 2,
        revision: concurrent[0].play!.revision,
        requestID: requestID(),
      })
      const stopped = await mutatePlayerReminders(api, player, {
        action: 'play',
        operation: 'stop',
        revision: restarted.play!.revision,
        requestID: requestID(),
      })
      expect(stopped.reminders).toHaveLength(1)
      expect(stopped.reminders.find((row) => row.kind === 'regular')?.status).toBe('waiting')
    } finally {
      vi.setSystemTime(baseNow)
    }
  })
  it('edits settings, disables/deletes a regular subscription and reports no suitable launch', async () => {
    const { action } = await save('regular', other, events[1], 15)
    let snapshot = await mutatePlayerReminders(api, other, action)
    snapshot = await mutatePlayerReminders(api, other, {
      action: 'play',
      operation: 'start',
      hours: 2,
      revision: null,
      requestID: requestID(),
    })
    let row = snapshot.reminders.find((row) => row.eventID === events[1].id)!
    expect(row.status).toBe('no-launch')
    snapshot = await mutatePlayerReminders(api, other, {
      action: 'toggle',
      id: row.id,
      enabled: false,
      revision: row.revision,
      requestID: requestID(),
    })
    row = snapshot.reminders.find((value) => value.id === row.id)!
    expect(row.status).toBe('disabled')
    const edit = await save('regular', other, events[1], 30)
    snapshot = await mutatePlayerReminders(api, other, { ...edit.action, includeCooldown: false })
    row = snapshot.reminders.find((value) => value.id === row.id)!
    expect(row.leadMinutes).toBe(30)
    expect(row.includeCooldown).toBe(false)
    snapshot = await mutatePlayerReminders(api, other, {
      action: 'delete',
      id: row.id,
      revision: row.revision,
      requestID: requestID(),
    })
    expect(snapshot.reminders.some((value) => value.id === row.id)).toBe(false)
    expect((await previewReminder(api, player, events[2].id, 'regular', 10)).reason).toContain(
      'нет расписания',
    )
  })
  it('skips blocked regular launches even with the checkbox off and keeps subscriptions when no launch fits', async () => {
    const cooldown = await api.create({
      collection: 'player-event-cooldowns',
      overrideAccess: true,
      context: { cooldownWrite: cooldownWriteCapability },
      data: {
        player: other.id,
        event: events[0].id,
        completedAt: baseNow,
        cooldownUntil: '2026-11-14T15:55:00Z',
        cancelled: false,
        revision: requestID(),
        requestID: requestID(),
      },
    })
    const selection = await save('regular', other, events[0], 5)
    const saved = await mutatePlayerReminders(api, other, {
      ...selection.action,
      includeCooldown: false,
    })
    expect(saved.reminders.find((row) => row.kind === 'regular')?.proposal?.launchAt).toBe(
      '2026-11-14T16:00:00Z',
    )
    const play = (
      await api.find({ collection: 'player-play-sessions', user: other, overrideAccess: false })
    ).docs[0]
    await api.update({
      collection: 'player-play-sessions',
      id: play.id,
      overrideAccess: true,
      context,
      data: { endsAt: '2026-11-14T15:30:00Z' },
    })
    const waiting = (await getPlayerReminders(api, other)).reminders.find(
      (row) => row.kind === 'regular',
    )!
    expect(waiting.status).toBe('no-launch')
    expect(waiting.enabled).toBe(true)
    await api.update({
      collection: 'events',
      id: events[0].id,
      overrideAccess: true,
      data: { durationMinutes: 120 },
    })
    expect(
      (await getPlayerReminders(api, other)).reminders.find((row) => row.kind === 'regular')
        ?.proposal?.launchAt,
    ).toBe('2026-11-14T15:25:00Z')
    await api.update({
      collection: 'events',
      id: events[0].id,
      overrideAccess: true,
      data: { durationMinutes: 30 },
    })
    await api.update({
      collection: 'player-event-cooldowns',
      id: cooldown.id,
      overrideAccess: true,
      context: { cooldownWrite: cooldownWriteCapability },
      data: { cancelled: true },
    })
  })
  it('denies guest/foreign reads and native mutations of owner, dates or calculated results', async () => {
    for (const collection of ['player-event-reminders', 'player-play-sessions'] as const) {
      await expect(api.find({ collection, user: null, overrideAccess: false })).rejects.toThrow()
      const own = (await api.find({ collection, user: player, overrideAccess: false })).docs[0]
      await expect(
        api.findByID({ collection, id: own.id, user: other, overrideAccess: false }),
      ).rejects.toThrow()
      await expect(
        api.update({
          collection,
          id: own.id,
          user: player,
          overrideAccess: false,
          data: { player: other.id },
        }),
      ).rejects.toThrow()
      await expect(
        api.delete({ collection, id: own.id, user: player, overrideAccess: false }),
      ).rejects.toThrow()
    }
    const play = (await getPlayerReminders(api, player)).play!
    await expect(
      mutatePlayerReminders(api, player, {
        action: 'play',
        operation: 'extend',
        hours: 1,
        revision: 'outdated',
        requestID: requestID(),
      }),
    ).rejects.toBeInstanceOf(ReminderConflict)
    expect((await getPlayerReminders(api, player)).play).toEqual(play)
  })
})

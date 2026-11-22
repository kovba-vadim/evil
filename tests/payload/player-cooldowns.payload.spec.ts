import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { Event, Player } from '../../src/payload-types'
import { openTestPayload } from '../helpers/testDatabase'
import { cooldownWriteCapability } from '../../src/access/player-cooldowns'
import {
  CooldownConflict,
  getPlayerCooldowns,
  mutatePlayerCooldown,
} from '../../src/queries/player-cooldowns'

let api: Payload
let player: Player & { collection: 'players' }
let other: Player & { collection: 'players' }
const events: Event[] = []
const context = { cooldownWrite: cooldownWriteCapability }
const complete = (previousRevision: string | null = null) => ({
  kind: 'complete' as const,
  requestID: crypto.randomUUID(),
  previousRevision,
})
beforeAll(async () => {
  api = await openTestPayload()
  for (let i = 0; i < 2; i++) {
    const doc = await api.create({
      collection: 'players',
      overrideAccess: true,
      disableVerificationEmail: true,
      data: {
        email: `${crypto.randomUUID()}@example.test`,
        password: crypto.randomUUID(),
        nickname: 'Игрок',
        timeZone: 'Europe/London',
        _verified: true,
      },
    })
    if (i === 0) player = { ...doc, collection: 'players' }
    else other = { ...doc, collection: 'players' }
  }
  for (const minutes of [60, 0, 10])
    events.push(
      await api.create({
        collection: 'events',
        overrideAccess: true,
        data: {
          name: `КД ${crypto.randomUUID()}`,
          slug: `cooldown-${crypto.randomUUID()}`,
          coins: 0,
          durationMinutes: 30, cooldownMinutes: minutes,
        },
      }),
    )
})
afterAll(async () => {
  try {
    if (player && other)
      await api.delete({
        collection: 'player-event-cooldowns',
        where: { player: { in: [player.id, other.id] } },
        overrideAccess: true,
        context,
      })
    for (const event of events)
      await api.delete({ collection: 'events', id: event.id, overrideAccess: true })
    for (const user of [player, other])
      if (user) await api.delete({ collection: 'players', id: user.id, overrideAccess: true })
  } finally {
    await api?.destroy()
  }
})

describe('personal cooldowns on isolated PostgreSQL', () => {
  it('serializes simultaneous marks, uses server time and never extends an active cooldown', async () => {
    const before = Date.now()
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => mutatePlayerCooldown(api, player, events[0].id, complete())),
    )
    const first = responses[0].records[0]
    expect(Date.parse(first.completedAt)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(first.completedAt)).toBeLessThanOrEqual(Date.now())
    expect(Date.parse(first.cooldownUntil) - Date.parse(first.completedAt)).toBe(60 * 60_000)
    expect(new Set(responses.map((value) => value.records[0].revision)).size).toBe(1)
    const persisted = await api.find({
      collection: 'player-event-cooldowns',
      user: player,
      overrideAccess: false,
    })
    expect(persisted.totalDocs).toBe(1)
    await api.update({
      collection: 'events',
      id: events[0].id,
      overrideAccess: true,
      data: { cooldownMinutes: 120 },
    })
    const retry = await mutatePlayerCooldown(api, player, events[0].id, complete())
    expect(retry.records[0].cooldownUntil).toBe(first.cooldownUntil)
    // The database index itself rejects a duplicate even for a trusted write.
    await expect(
      api.create({
        collection: 'player-event-cooldowns',
        overrideAccess: true,
        context,
        data: {
          player: player.id,
          event: events[0].id,
          completedAt: first.completedAt,
          cooldownUntil: first.cooldownUntil,
          revision: crypto.randomUUID(),
          requestID: crypto.randomUUID(),
          cancelled: false,
        },
      }),
    ).rejects.toThrow()
  })
  it('denies guests, other players, arbitrary profile fields and standard API mutations', async () => {
    const own = (await getPlayerCooldowns(api, player, events[0].id)).records[0]
    await expect(
      api.find({ collection: 'player-event-cooldowns', user: null, overrideAccess: false }),
    ).rejects.toThrow()
    expect(
      (await api.find({ collection: 'player-event-cooldowns', user: other, overrideAccess: false }))
        .docs,
    ).toEqual([])
    await expect(
      api.findByID({
        collection: 'player-event-cooldowns',
        id: own.id,
        user: other,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      api.update({
        collection: 'player-event-cooldowns',
        id: own.id,
        user: other,
        overrideAccess: false,
        data: { cancelled: true },
      }),
    ).rejects.toThrow()
    await expect(
      api.update({
        collection: 'player-event-cooldowns',
        id: own.id,
        user: player,
        overrideAccess: false,
        data: { player: other.id, cooldownUntil: new Date().toISOString() },
      }),
    ).rejects.toThrow()
    await expect(
      api.delete({
        collection: 'player-event-cooldowns',
        id: own.id,
        user: player,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      api.create({
        collection: 'player-event-cooldowns',
        user: player,
        overrideAccess: false,
        data: {
          player: other.id,
          event: events[1].id,
          completedAt: new Date().toISOString(),
          cooldownUntil: new Date().toISOString(),
          requestID: crypto.randomUUID(),
          revision: crypto.randomUUID(),
          cancelled: false,
        },
      }),
    ).rejects.toThrow()
  })
  it('cancels only the owned version, ignores its delayed retry and rejects stale cancellation', async () => {
    const action = complete()
    const current = (await mutatePlayerCooldown(api, other, events[0].id, action)).records[0]
    const cancelled = await mutatePlayerCooldown(api, other, events[0].id, {
      kind: 'cancel',
      revision: current.revision,
    })
    expect(cancelled.records[0].cancelled).toBe(true)
    expect((await getPlayerCooldowns(api, other)).records).toEqual([])
    expect(
      (await mutatePlayerCooldown(api, other, events[0].id, action)).records[0].cancelled,
    ).toBe(true)
    const replacement = (
      await mutatePlayerCooldown(api, other, events[0].id, complete(current.revision))
    ).records[0]
    expect(replacement.id).toBe(current.id)
    expect(replacement.revision).not.toBe(current.revision)
    await expect(
      mutatePlayerCooldown(api, other, events[0].id, {
        kind: 'cancel',
        revision: current.revision,
      }),
    ).rejects.toBeInstanceOf(CooldownConflict)
    expect((await getPlayerCooldowns(api, player, events[0].id)).records[0].cancelled).toBe(false)
  })
  it('keeps zero-cooldown marks idempotent, excludes them from active lists and guards concurrent new revisions', async () => {
    const action = complete()
    const marked = (await mutatePlayerCooldown(api, player, events[1].id, action)).records[0]
    expect(marked.cooldownUntil).toBe(marked.completedAt)
    expect((await mutatePlayerCooldown(api, player, events[1].id, action)).records[0]).toEqual(
      marked,
    )
    expect(
      (await getPlayerCooldowns(api, player)).records.some((doc) => doc.eventID === events[1].id),
    ).toBe(false)
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        mutatePlayerCooldown(api, player, events[1].id, complete(marked.revision)),
      ),
    )
    expect(attempts.filter((value) => value.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((value) => value.status === 'rejected')).toHaveLength(3)
  })
  it('updates an expired mark in place using the latest event setting and sorts active results', async () => {
    const first = (await getPlayerCooldowns(api, player, events[0].id)).records[0]
    await api.update({
      collection: 'player-event-cooldowns',
      id: first.id,
      user: player,
      overrideAccess: false,
      context,
      data: { cooldownUntil: new Date(Date.now() - 1000).toISOString() },
    })
    const updated = (
      await mutatePlayerCooldown(api, player, events[0].id, complete(first.revision))
    ).records[0]
    expect(updated.id).toBe(first.id)
    expect(Date.parse(updated.cooldownUntil) - Date.parse(updated.completedAt)).toBe(120 * 60_000)
    await mutatePlayerCooldown(api, player, events[2].id, complete())
    expect((await getPlayerCooldowns(api, player)).records.map((doc) => doc.eventID)).toEqual([
      events[2].id,
      events[0].id,
    ])
  })
})

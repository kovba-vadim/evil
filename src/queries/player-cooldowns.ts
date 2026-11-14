import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { randomUUID } from 'node:crypto'
import { createLocalReq, type Payload } from 'payload'
import type { Player, PlayerEventCooldown } from '@/payload-types'
import { cooldownWriteCapability } from '@/access/player-cooldowns'
import { cooldownEnd, type CooldownSnapshot } from '@/lib/player-cooldowns'

type Actor = Player & { collection: 'players' }
export class CooldownConflict extends Error {}

export async function getPlayerCooldowns(
  payload: Payload,
  user: Actor,
  eventID?: number,
): Promise<CooldownSnapshot> {
  const serverNow = new Date().toISOString()
  const records: PlayerEventCooldown[] = []
  for (let page = 1; ; page++) {
    const result = await payload.find({
      collection: 'player-event-cooldowns',
      user,
      overrideAccess: false,
      depth: 0,
      where: eventID
        ? { event: { equals: eventID } }
        : {
            and: [{ cooldownUntil: { greater_than: serverNow } }, { cancelled: { equals: false } }],
          },
      sort: ['cooldownUntil', 'id'],
      limit: 100,
      page,
    })
    records.push(...result.docs)
    if (!result.hasNextPage) break
  }
  const ids = [
    ...new Set(records.map((doc) => (typeof doc.event === 'number' ? doc.event : doc.event.id))),
  ]
  const events = new Map<number, { name: string; slug: string }>()
  if (ids.length)
    for (let page = 1; ; page++) {
      const result = await payload.find({
        collection: 'events',
        user,
        overrideAccess: false,
        depth: 0,
        select: { name: true, slug: true },
        where: { id: { in: ids } },
        page,
        limit: 100,
      })
      result.docs.forEach((doc) => events.set(doc.id, { name: doc.name, slug: doc.slug }))
      if (!result.hasNextPage) break
    }
  return {
    playerID: user.id,
    serverNow,
    records: records.flatMap((doc) => {
      const eventID = typeof doc.event === 'number' ? doc.event : doc.event?.id
      const event = events.get(eventID)
      return event
        ? [
            {
              id: doc.id,
              eventID,
              ...event,
              completedAt: doc.completedAt,
              cooldownUntil: doc.cooldownUntil,
              cancelled: doc.cancelled,
              revision: doc.revision,
            },
          ]
        : []
    }),
  }
}

export async function mutatePlayerCooldown(
  payload: Payload,
  user: Actor,
  eventID: number,
  action:
    | { kind: 'complete'; requestID: string; previousRevision: string | null }
    | { kind: 'cancel'; revision: string },
) {
  if (user.collection !== 'players' || !Number.isSafeInteger(eventID) || eventID <= 0)
    throw new Error('Недопустимая операция.')
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) throw new Error('Транзакции PostgreSQL обязательны.')
  const req = await createLocalReq(
    { user, context: { cooldownWrite: cooldownWriteCapability }, req: { transactionID } },
    payload,
  )
  try {
    const database = payload.db as unknown as PostgresAdapter
    // Only the lock uses SQL; all content/schema operations use Payload.
    await database.sessions[transactionID].db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`evil:cooldown:${user.id}:${eventID}`}, 0))`,
    )
    const current = (
      await payload.find({
        collection: 'player-event-cooldowns',
        req,
        user,
        overrideAccess: false,
        depth: 0,
        limit: 1,
        where: { event: { equals: eventID } },
        showHiddenFields: true,
        // requestID is intentionally not readable by the API; the trusted operation reads it below.
      })
    ).docs[0]
    if (action.kind === 'cancel') {
      if (current && current.revision !== action.revision)
        throw new CooldownConflict('Отметка уже изменилась. Обновите данные перед отменой.')
      if (current && !current.cancelled)
        await payload.update({
          collection: 'player-event-cooldowns',
          id: current.id,
          data: { cancelled: true },
          req,
          user,
          overrideAccess: false,
        })
    } else {
      const now = new Date().toISOString()
      // Active marks are immutable until cancelled or expired.
      if (!current || current.cancelled || Date.parse(current.cooldownUntil) <= Date.parse(now)) {
        // Read the internal idempotency marker only for this known, owned document.
        const trusted = current
          ? await payload.findByID({
              collection: 'player-event-cooldowns',
              id: current.id,
              req,
              overrideAccess: true,
              depth: 0,
              showHiddenFields: true,
            })
          : null
        if (trusted?.requestID !== action.requestID) {
          if ((current?.revision ?? null) !== action.previousRevision)
            throw new CooldownConflict('Отметка уже изменилась. Обновите данные.')
          const event = await payload.findByID({
            collection: 'events',
            id: eventID,
            req,
            user,
            overrideAccess: false,
            depth: 0,
          })
          const data = {
            player: user.id,
            event: eventID,
            completedAt: now,
            cooldownUntil: cooldownEnd(now, event.cooldownMinutes),
            requestID: action.requestID,
            cancelled: false,
            revision: randomUUID(),
          }
          if (current)
            await payload.update({
              collection: 'player-event-cooldowns',
              id: current.id,
              data,
              req,
              user,
              overrideAccess: false,
            })
          else
            await payload.create({
              collection: 'player-event-cooldowns',
              data,
              req,
              user,
              overrideAccess: false,
            })
        }
      }
    }
    await payload.db.commitTransaction(transactionID)
  } catch (error) {
    if (payload.db.sessions?.[transactionID]) await payload.db.rollbackTransaction(transactionID)
    throw error
  }
  return getPlayerCooldowns(payload, user, eventID)
}

import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { randomUUID } from 'node:crypto'
import { createLocalReq, type Payload } from 'payload'
import type { Player, PlayerEventCooldown, PlayerQuestCooldown } from '@/payload-types'
import { cooldownWriteCapability } from '@/access/player-cooldowns'
import {
  cooldownEnd,
  type CooldownSnapshot,
  type QuestCooldownSnapshot,
} from '@/lib/player-cooldowns'

type Actor = Player & { collection: 'players' }
export class CooldownConflict extends Error {}
type Kind = 'event' | 'quest'
type Action =
  | { kind: 'complete'; requestID: string; previousRevision: string | null }
  | { kind: 'cancel'; revision: string }

const collectionFor = (kind: Kind) =>
  kind === 'quest' ? 'player-quest-cooldowns' : 'player-event-cooldowns'

async function readCooldowns(
  payload: Payload,
  user: Actor,
  eventID: number | undefined,
  kind: Kind,
): Promise<CooldownSnapshot> {
  const serverNow = new Date().toISOString()
  const records: (PlayerEventCooldown | PlayerQuestCooldown)[] = []
  for (let page = 1; ; page++) {
    const result = await payload.find({
      collection: collectionFor(kind),
      user,
      overrideAccess: false,
      depth: 0,
      where: eventID
        ? { [kind]: { equals: eventID } }
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
  const targetID = (doc: PlayerEventCooldown | PlayerQuestCooldown) => {
    const target = 'quest' in doc ? doc.quest : doc.event
    return typeof target === 'number' ? target : target.id
  }
  const ids = [...new Set(records.map(targetID))]
  const events = new Map<number, { name: string; slug: string }>()
  if (ids.length)
    for (let page = 1; ; page++) {
      const result = await payload.find({
        collection: kind === 'quest' ? 'quests' : 'events',
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
      const eventID = targetID(doc)
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

export function getPlayerCooldowns(payload: Payload, user: Actor, eventID?: number) {
  return readCooldowns(payload, user, eventID, 'event')
}

export async function getPlayerQuestCooldowns(
  payload: Payload,
  user: Actor,
  questID?: number,
): Promise<QuestCooldownSnapshot> {
  const snapshot = await readCooldowns(payload, user, questID, 'quest')
  return {
    ...snapshot,
    records: snapshot.records.map(({ eventID, ...row }) => ({ ...row, questID: eventID })),
  }
}

async function writeCooldown(
  payload: Payload,
  user: Actor,
  eventID: number,
  action: Action,
  kind: Kind,
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
    const collection = collectionFor(kind)
    // Reminder saves and cooldown changes use the same player lock, in this order.
    if (kind === 'event')
      await database.sessions[transactionID].db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`evil:reminders:${user.id}`}, 0))`,
      )
    // Only the lock uses SQL; all content/schema operations use Payload.
    await database.sessions[transactionID].db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`evil:${kind === 'quest' ? 'quest-' : ''}cooldown:${user.id}:${eventID}`}, 0))`,
    )
    const current = (
      await payload.find({
        collection,
        req,
        user,
        overrideAccess: false,
        depth: 0,
        limit: 1,
        where: { [kind]: { equals: eventID } },
        showHiddenFields: true,
        // requestID is intentionally not readable by the API; the trusted operation reads it below.
      })
    ).docs[0]
    if (action.kind === 'cancel') {
      if (kind === 'quest' && !current) throw new CooldownConflict('Отметка не найдена.')
      if (current && current.revision !== action.revision)
        throw new CooldownConflict('Отметка уже изменилась. Обновите данные перед отменой.')
      if (current && !current.cancelled)
        await payload.update({
          collection,
          id: current.id,
          data: { cancelled: true },
          req,
          user,
          overrideAccess: false,
        })
    } else {
      const now = new Date().toISOString()
      // Active marks are immutable until cancelled or expired.
      const active =
        current && !current.cancelled && Date.parse(current.cooldownUntil) > Date.parse(now)
      if (!active || kind === 'quest') {
        // Read the internal idempotency marker only for this known, owned document.
        const trusted = current
          ? await payload.findByID({
              collection,
              id: current.id,
              req,
              overrideAccess: true,
              depth: 0,
              showHiddenFields: true,
            })
          : null
        if (trusted?.requestID !== action.requestID) {
          if (active) throw new CooldownConflict('Квест уже сдан. Дождитесь окончания КД.')
          if ((current?.revision ?? null) !== action.previousRevision)
            throw new CooldownConflict('Отметка уже изменилась. Обновите данные.')
          const target = await payload.findByID({
            collection: kind === 'quest' ? 'quests' : 'events',
            id: eventID,
            req,
            user,
            overrideAccess: false,
            depth: 0,
          })
          const minutes =
            'cooldownMinutes' in target && kind === 'event'
              ? target.cooldownMinutes
              : 'cooldown' in target
                ? target.cooldown
                : null
          if (kind === 'quest' && !minutes) throw new CooldownConflict('У квеста нет личного КД.')
          const data = {
            player: user.id,
            completedAt: now,
            cooldownUntil: cooldownEnd(now, minutes),
            requestID: action.requestID,
            cancelled: false,
            revision: randomUUID(),
          }
          if (current)
            await payload.update({
              collection,
              id: current.id,
              data: { ...data, [kind]: eventID },
              req,
              user,
              overrideAccess: false,
            })
          else
            await payload.create({
              collection,
              data: kind === 'quest' ? { ...data, quest: eventID } : { ...data, event: eventID },
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
}

export async function mutatePlayerCooldown(
  payload: Payload,
  user: Actor,
  eventID: number,
  action: Action,
) {
  await writeCooldown(payload, user, eventID, action, 'event')
  return getPlayerCooldowns(payload, user, eventID)
}

export async function mutatePlayerQuestCooldown(
  payload: Payload,
  user: Actor,
  questID: number,
  action: Action,
) {
  await writeCooldown(payload, user, questID, action, 'quest')
  return getPlayerQuestCooldowns(payload, user, questID)
}

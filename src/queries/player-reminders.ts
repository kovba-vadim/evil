import { randomUUID } from 'node:crypto'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { createLocalReq, type Payload, type PayloadRequest } from 'payload'
import type { Player, PlayerEventReminder, PlayerPlaySession } from '@/payload-types'
import { reminderWriteCapability } from '@/access/player-reminders'
import {
  nextReminder,
  playingAt,
  type PlayPeriod,
  type ReminderPreview,
  type ReminderSnapshot,
} from '@/lib/player-reminders'
import type { LaunchClock } from '@/lib/event-launches'

type Actor = Player & { collection: 'players' }
type EventDefinition = {
  id: number
  name: string
  slug: string
  times: LaunchClock[]
  durationMinutes: number
}
const relationID = (value: number | { id: number } | null | undefined) =>
  typeof value === 'number' ? value : (value?.id ?? null)
const publicPlay = (value?: PlayerPlaySession): PlayPeriod | null =>
  value ? { startedAt: value.startedAt, endsAt: value.endsAt, revision: value.revision } : null
export class ReminderConflict extends Error {
  constructor(
    message: string,
    public proposal?: ReminderPreview,
  ) {
    super(message)
  }
}

async function eventDefinitions(
  payload: Payload,
  user: Actor,
  ids: number[],
  req?: PayloadRequest,
) {
  const definitions = new Map<number, EventDefinition>()
  const clocks = new Map<number, LaunchClock>()
  const relations = new Map<number, number[]>()
  if (!ids.length) return definitions
  for (let page = 1; ; page++) {
    const result = await payload.find({
      collection: 'events',
      user,
      overrideAccess: false,
      req,
      depth: 0,
      limit: 100,
      page,
      where: { id: { in: ids } },
      select: { name: true, slug: true, launchTimes: true, durationMinutes: true },
    })
    for (const doc of result.docs) {
      definitions.set(doc.id, {
        id: doc.id,
        name: doc.name,
        slug: doc.slug,
        times: [],
        durationMinutes: doc.durationMinutes,
      })
      relations.set(
        doc.id,
        (doc.launchTimes ?? []).flatMap((value) => {
          const id = relationID(value)
          return id === null ? [] : [id]
        }),
      )
    }
    if (!result.hasNextPage) break
  }
  const timeIDs = [...new Set([...relations.values()].flat())]
  if (timeIDs.length)
    for (let page = 1; ; page++) {
      const result = await payload.find({
        collection: 'event-times',
        user,
        overrideAccess: false,
        req,
        depth: 0,
        limit: 100,
        page,
        where: { id: { in: timeIDs } },
        select: { time: true },
      })
      result.docs.forEach((doc) => clocks.set(doc.id, { id: doc.id, time: doc.time }))
      if (!result.hasNextPage) break
    }
  for (const [id, definition] of definitions)
    definition.times = (relations.get(id) ?? []).flatMap((id) =>
      clocks.has(id) ? [clocks.get(id)!] : [],
    )
  return definitions
}

async function rawReminders(payload: Payload, user: Actor, eventID?: number, req?: PayloadRequest) {
  const docs: PlayerEventReminder[] = []
  for (let page = 1; ; page++) {
    const result = await payload.find({
      collection: 'player-event-reminders',
      user,
      overrideAccess: false,
      req,
      depth: 0,
      where: { kind: { equals: 'regular' }, ...(eventID ? { event: { equals: eventID } } : {}) },
      sort: ['createdAt', 'id'],
      page,
      limit: 100,
    })
    docs.push(...result.docs)
    if (!result.hasNextPage) return docs
  }
}
async function rawPlay(payload: Payload, user: Actor, req?: PayloadRequest) {
  return (
    await payload.find({
      collection: 'player-play-sessions',
      user,
      overrideAccess: false,
      req,
      depth: 0,
      limit: 1,
    })
  ).docs[0]
}

export async function getPlayerPlay(payload: Payload, user: Actor) {
  const play = publicPlay(await rawPlay(payload, user))
  return { playerID: user.id, serverNow: new Date().toISOString(), play }
}
async function cooldowns(
  payload: Payload,
  user: Actor,
  ids: number[],
  now: string,
  req?: PayloadRequest,
) {
  const result = new Map<number, string>()
  if (!ids.length) return result
  for (let page = 1; ; page++) {
    const rows = await payload.find({
      collection: 'player-event-cooldowns',
      user,
      overrideAccess: false,
      req,
      depth: 0,
      limit: 100,
      page,
      where: {
        and: [
          { event: { in: ids } },
          { cancelled: { equals: false } },
          { cooldownUntil: { greater_than: now } },
        ],
      },
      select: { event: true, cooldownUntil: true },
    })
    rows.docs.forEach((doc) => {
      const id = relationID(doc.event)
      if (id !== null) result.set(id, doc.cooldownUntil)
    })
    if (!rows.hasNextPage) return result
  }
}

export async function getPlayerReminders(
  payload: Payload,
  user: Actor,
  eventID?: number,
): Promise<ReminderSnapshot> {
  const now = new Date().toISOString()
  const docs = await rawReminders(payload, user, eventID)
  const play = publicPlay(await rawPlay(payload, user))
  const ids = [
    ...new Set(
      docs.flatMap((doc) => {
        const id = relationID(doc.event)
        return id === null ? [] : [id]
      }),
    ),
  ]
  const definitions = await eventDefinitions(payload, user, ids)
  const personal = await cooldowns(payload, user, ids, now)
  return {
    playerID: user.id,
    serverNow: now,
    play,
    reminders: docs.map((doc) => {
      const eventID = relationID(doc.event),
        event = eventID === null ? null : definitions.get(eventID)
      let proposal = null,
        status: ReminderSnapshot['reminders'][number]['status'] = 'invalid'
      if (event && event.times.length) {
        if (!doc.enabled) status = 'disabled'
        else if (!playingAt(play, now)) status = 'waiting'
        else {
          proposal = nextReminder(
            event.times,
            doc.leadMinutes,
            now,
            event.durationMinutes,
            personal.get(eventID!) ?? null,
            play,
          )
          status = proposal ? 'scheduled' : 'no-launch'
        }
      }
      return {
        id: doc.id,
        eventID,
        name: event?.name ?? 'Ивент недоступен',
        slug: event?.slug ?? null,
        kind: 'regular',
        leadMinutes: doc.leadMinutes,
        includeCooldown: doc.includeCooldown,
        enabled: doc.enabled,
        revision: doc.revision,
        proposal,
        status,
        cooldownUntil: eventID === null ? null : (personal.get(eventID) ?? null),
      }
    }),
  }
}

export async function previewReminder(
  payload: Payload,
  user: Actor,
  eventID: number,
  kind: 'regular',
  lead: number,
  req?: PayloadRequest,
): Promise<ReminderPreview> {
  if (kind !== 'regular') throw new Error('Доступны только регулярные подписки.')
  const now = new Date().toISOString()
  const event = (await eventDefinitions(payload, user, [eventID], req)).get(eventID)
  const current = (await rawReminders(payload, user, eventID, req))[0]
  const play = publicPlay(await rawPlay(payload, user, req))
  const personal = await cooldowns(payload, user, [eventID], now, req)
  const proposal = event
    ? nextReminder(
        event.times,
        lead,
        now,
        event.durationMinutes,
        personal.get(eventID) ?? null,
        play,
      )
    : null
  return {
    serverNow: now,
    revision: current?.revision ?? null,
    proposal,
    cooldownUntil: personal.get(eventID) ?? null,
    reason: !event
      ? 'Ивент недоступен.'
      : !event.times.length
        ? 'У ивента нет расписания: выбрать запуск нельзя.'
        : !playingAt(play, now)
          ? 'Ожидает включения «Я играю».'
          : !proposal
            ? 'В оставшийся период «Я играю» подходящих запусков нет.'
            : null,
  }
}

export type ReminderAction =
  | {
      action: 'save'
      eventID: number
      kind: 'regular'
      leadMinutes: number
      includeCooldown: boolean
      enabled: boolean
      launchAt: null
      revision: string | null
      requestID: string
    }
  | { action: 'delete'; id: number; revision: string; requestID: string }
  | { action: 'toggle'; id: number; enabled: boolean; revision: string; requestID: string }
  | {
      action: 'play'
      operation: 'start' | 'extend' | 'stop'
      hours?: number
      revision: string | null
      requestID: string
    }

export async function mutatePlayerReminders(
  payload: Payload,
  user: Actor,
  input: ReminderAction,
  eventID?: number,
) {
  if (user.collection !== 'players') throw new Error('Необходимо войти игроком.')
  if (input.action === 'save' && (input.kind !== 'regular' || input.launchAt !== null))
    throw new Error('Доступны только регулярные подписки.')
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) throw new Error('Транзакции PostgreSQL обязательны.')
  const req = await createLocalReq(
    { user, context: { reminderWrite: reminderWriteCapability }, req: { transactionID } },
    payload,
  )
  try {
    await (payload.db as unknown as PostgresAdapter).sessions[transactionID].db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`evil:reminders:${user.id}`}, 0))`,
    )
    if (input.action === 'play') {
      const current = await rawPlay(payload, user, req)
      const trusted = current
        ? await payload.findByID({
            collection: 'player-play-sessions',
            id: current.id,
            req,
            overrideAccess: true,
            showHiddenFields: true,
            depth: 0,
          })
        : null
      if (trusted?.requestID !== input.requestID) {
        if ((current?.revision ?? null) !== input.revision)
          throw new ReminderConflict('Режим уже изменился. Обновите данные.')
        const now = new Date().toISOString(),
          active = playingAt(publicPlay(current), now)
        if (input.operation === 'start' && (active || ![2, 4, 6].includes(input.hours!)))
          throw new ReminderConflict('Для активного режима используйте продление.')
        if (input.operation === 'extend' && (!active || ![1, 2].includes(input.hours!)))
          throw new ReminderConflict('Продление доступно только для активного режима.')
        const data = {
          player: user.id,
          startedAt: input.operation === 'start' ? now : (current?.startedAt ?? now),
          endsAt:
            input.operation === 'stop'
              ? now
              : new Date(
                  (input.operation === 'extend' ? Date.parse(current!.endsAt) : Date.parse(now)) +
                    input.hours! * 3_600_000,
                ).toISOString(),
          revision: randomUUID(),
          requestID: input.requestID,
        }
        if (current)
          await payload.update({
            collection: 'player-play-sessions',
            id: current.id,
            data,
            req,
            user,
            overrideAccess: false,
          })
        else if (input.operation !== 'stop')
          await payload.create({
            collection: 'player-play-sessions',
            data,
            req,
            user,
            overrideAccess: false,
          })
      }
    } else {
      const current =
        input.action === 'save'
          ? (await rawReminders(payload, user, input.eventID, req))[0]
          : (
              await payload.find({
                collection: 'player-event-reminders',
                req,
                user,
                overrideAccess: false,
                depth: 0,
                limit: 1,
                where: { id: { equals: input.id }, kind: { equals: 'regular' } },
              })
            ).docs[0]
      if (!current && input.action !== 'save') {
        if (input.action !== 'delete') throw new ReminderConflict('Настройка уже удалена.')
      } else {
        const trusted = current
          ? await payload.findByID({
              collection: 'player-event-reminders',
              id: current.id,
              req,
              overrideAccess: true,
              showHiddenFields: true,
              depth: 0,
            })
          : null
        if (trusted?.requestID !== input.requestID) {
          if ((current?.revision ?? null) !== input.revision)
            throw new ReminderConflict(
              'Настройка уже изменилась. Обновите предложение перед сохранением.',
            )
          if (input.action === 'save') {
            const event = (await eventDefinitions(payload, user, [input.eventID], req)).get(
              input.eventID,
            )
            if (!event?.times.length) throw new Error('У ивента нет доступного расписания.')
            const data = {
              player: user.id,
              event: input.eventID,
              kind: 'regular' as const,
              leadMinutes: input.leadMinutes,
              includeCooldown: input.includeCooldown,
              enabled: input.enabled,
              launchAt: null,
              remindAt: null,
              revision: randomUUID(),
              requestID: input.requestID,
            }
            if (current)
              await payload.update({
                collection: 'player-event-reminders',
                id: current.id,
                data,
                req,
                user,
                overrideAccess: false,
              })
            else
              await payload.create({
                collection: 'player-event-reminders',
                data,
                req,
                user,
                overrideAccess: false,
              })
          } else if (input.action === 'delete')
            await payload.delete({
              collection: 'player-event-reminders',
              id: current!.id,
              req,
              user,
              overrideAccess: false,
            })
          else {
            await payload.update({
              collection: 'player-event-reminders',
              id: current!.id,
              data: { enabled: input.enabled, revision: randomUUID(), requestID: input.requestID },
              req,
              user,
              overrideAccess: false,
            })
          }
        }
      }
    }
    await payload.db.commitTransaction(transactionID)
  } catch (error) {
    if (payload.db.sessions?.[transactionID]) await payload.db.rollbackTransaction(transactionID)
    throw error
  }
  return getPlayerReminders(payload, user, eventID)
}

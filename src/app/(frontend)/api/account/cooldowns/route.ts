import { NextResponse } from 'next/server'
import { playerSession } from '@/auth/players'
import { consumeAttempt } from '@/lib/player-policy'
import {
  CooldownConflict,
  getPlayerCooldowns,
  getPlayerQuestCooldowns,
  mutatePlayerCooldown,
  mutatePlayerQuestCooldown,
} from '@/queries/player-cooldowns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
  'Referrer-Policy': 'no-referrer',
}
const reply = (data: object, status = 200) => NextResponse.json(data, { status, headers })

export async function GET(request: Request) {
  const { payload, user } = await playerSession()
  if (!user) return reply({ message: 'Необходимо войти.' }, 401)
  const params = new URL(request.url).searchParams
  const quest = params.get('kind') === 'quest'
  const value = params.get(quest ? 'questID' : 'eventID')
  const eventID = value === null ? undefined : Number(value)
  if (eventID !== undefined && (!Number.isSafeInteger(eventID) || eventID <= 0))
    return reply({ message: quest ? 'Некорректный квест.' : 'Некорректный ивент.' }, 400)
  try {
    return reply(
      await (quest ? getPlayerQuestCooldowns : getPlayerCooldowns)(payload, user, eventID),
    )
  } catch {
    return reply({ message: 'Не удалось загрузить личные КД.' }, 500)
  }
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return reply({ message: 'Недопустимый источник запроса.' }, 403)
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return reply({ message: 'Ожидается JSON.' }, 415)
  if (!consumeAttempt('cooldowns:global', 600))
    return reply({ message: 'Слишком много запросов. Повторите позже.' }, 429)
  const { payload, user } = await playerSession()
  if (!user) return reply({ message: 'Необходимо войти.' }, 401)
  if (!consumeAttempt(`cooldowns:${user.id}`, 120))
    return reply({ message: 'Слишком много запросов. Повторите позже.' }, 429)
  let data: Record<string, unknown>
  try {
    const reader = request.body?.getReader()
    if (!reader) throw new Error()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1024) {
        await reader.cancel()
        return reply({ message: 'Слишком большой запрос.' }, 413)
      }
      chunks.push(value)
    }
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
    if (
      Object.keys(data).some(
        (key) =>
          !['eventID', 'questID', 'action', 'requestID', 'revision', 'previousRevision'].includes(
            key,
          ),
      )
    )
      throw new Error()
    const id = data.questID ?? data.eventID
    if (
      ('questID' in data && 'eventID' in data) ||
      !Number.isSafeInteger(id) ||
      (id as number) <= 0
    )
      throw new Error()
    if (data.action === 'complete') {
      if (
        typeof data.requestID !== 'string' ||
        !/^[a-f0-9-]{36}$/i.test(data.requestID) ||
        data.revision !== undefined
      )
        throw new Error()
      if (
        data.previousRevision !== null &&
        (typeof data.previousRevision !== 'string' ||
          !/^[a-f0-9-]{36}$/i.test(data.previousRevision))
      )
        throw new Error()
    } else if (data.action === 'cancel') {
      if (
        typeof data.revision !== 'string' ||
        !/^[a-f0-9-]{36}$/i.test(data.revision) ||
        data.requestID !== undefined ||
        data.previousRevision !== undefined
      )
        throw new Error()
    } else throw new Error()
  } catch {
    return reply({ message: 'Некорректная операция. Обновите страницу.' }, 400)
  }
  const isQuest = 'questID' in data
  if (isQuest && request.headers.get('X-Cooldown-Player') !== String(user.id))
    return reply({ message: 'Сессия изменилась. Войдите заново.' }, 401)
  try {
    const action =
      data.action === 'complete'
        ? {
            kind: 'complete' as const,
            requestID: data.requestID as string,
            previousRevision: data.previousRevision as string | null,
          }
        : { kind: 'cancel' as const, revision: data.revision as string }
    return reply(
      await (isQuest ? mutatePlayerQuestCooldown : mutatePlayerCooldown)(
        payload,
        user,
        (isQuest ? data.questID : data.eventID) as number,
        action,
      ),
    )
  } catch (error) {
    return reply(
      {
        message:
          error instanceof CooldownConflict
            ? error.message
            : 'Не удалось сохранить отметку. Обновите данные и повторите.',
      },
      error instanceof CooldownConflict ? 409 : 400,
    )
  }
}

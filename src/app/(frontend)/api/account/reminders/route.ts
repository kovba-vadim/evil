import { NextResponse } from 'next/server'
import { playerSession } from '@/auth/players'
import { consumeAttempt } from '@/lib/player-policy'
import { validLead } from '@/lib/player-reminders'
import {
  getPlayerReminders,
  mutatePlayerReminders,
  previewReminder,
  ReminderConflict,
  type ReminderAction,
} from '@/queries/player-reminders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
  'Referrer-Policy': 'no-referrer',
}
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers })
const id = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
function scope(request: Request) {
  const value = new URL(request.url).searchParams.get('eventID')
  if (value === null) return undefined
  const number = Number(value)
  if (!id(number)) throw new Error()
  return number
}

export async function GET(request: Request) {
  const { payload, user } = await playerSession()
  if (!user) return reply({ message: 'Необходимо войти.' }, 401)
  const query = new URL(request.url).searchParams
  try {
    const eventID = scope(request)
    if (query.get('preview') === '1') {
      const kind = query.get('kind'),
        lead = Number(query.get('leadMinutes'))
      if (!eventID || kind !== 'regular' || !validLead(lead))
        return reply({ message: 'Проверьте параметры напоминания.' }, 400)
      return reply({
        ...(await previewReminder(payload, user, eventID, kind, lead)),
        playerID: user.id,
      })
    }
    return reply(await getPlayerReminders(payload, user, eventID))
  } catch {
    return reply({ message: 'Не удалось загрузить настройки напоминаний.' }, 400)
  }
}

function parse(value: unknown): ReminderAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
  const data = value as Record<string, unknown>
  if (!uuid(data.requestID) || !(data.revision === null || uuid(data.revision))) throw new Error()
  let allowed: string[]
  if (data.action === 'save') {
    allowed = [
      'action',
      'eventID',
      'kind',
      'leadMinutes',
      'includeCooldown',
      'enabled',
      'launchAt',
      'revision',
      'requestID',
    ]
    if (
      !id(data.eventID) ||
      data.kind !== 'regular' ||
      !validLead(data.leadMinutes) ||
      typeof data.includeCooldown !== 'boolean' ||
      typeof data.enabled !== 'boolean'
    )
      throw new Error()
    if (data.launchAt !== null) throw new Error()
  } else if (data.action === 'delete' || data.action === 'toggle') {
    allowed = [
      'action',
      'id',
      'revision',
      'requestID',
      ...(data.action === 'toggle' ? ['enabled'] : []),
    ]
    if (
      !id(data.id) ||
      !uuid(data.revision) ||
      (data.action === 'toggle' && typeof data.enabled !== 'boolean')
    )
      throw new Error()
  } else if (data.action === 'play') {
    allowed = [
      'action',
      'operation',
      'revision',
      'requestID',
      ...(data.operation === 'stop' ? [] : ['hours']),
    ]
    if (!['start', 'extend', 'stop'].includes(String(data.operation))) throw new Error()
    if (data.operation === 'start' && ![2, 4, 6].includes(data.hours as number)) throw new Error()
    if (data.operation === 'extend' && ![1, 2].includes(data.hours as number)) throw new Error()
  } else throw new Error()
  if (Object.keys(data).some((key) => !allowed.includes(key))) throw new Error()
  return data as ReminderAction
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return reply({ message: 'Недопустимый источник запроса.' }, 403)
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return reply({ message: 'Ожидается JSON.' }, 415)
  if (!consumeAttempt('reminders:global', 600))
    return reply({ message: 'Слишком много запросов. Повторите позже.' }, 429)
  const { payload, user } = await playerSession()
  if (!user) return reply({ message: 'Необходимо войти.' }, 401)
  const expectedPlayer = request.headers.get('X-Reminder-Player')
  if (expectedPlayer !== null && expectedPlayer !== String(user.id))
    return reply({ message: 'Сессия изменилась. Войдите заново.' }, 401)
  if (!consumeAttempt(`reminders:${user.id}`, 120))
    return reply({ message: 'Слишком много запросов. Повторите позже.' }, 429)
  let input: ReminderAction, eventID: number | undefined
  try {
    eventID = scope(request)
    const reader = request.body?.getReader()
    if (!reader) throw new Error()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2048) {
        await reader.cancel()
        return reply({ message: 'Слишком большой запрос.' }, 413)
      }
      chunks.push(value)
    }
    input = parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  } catch {
    return reply(
      {
        message:
          'Проверьте настройки: предупреждение от 1 до 120 минут, допустимый режим и актуальная версия.',
      },
      400,
    )
  }
  try {
    return reply(await mutatePlayerReminders(payload, user, input, eventID))
  } catch (error) {
    return reply(
      {
        message:
          error instanceof ReminderConflict
            ? error.message
            : 'Не удалось сохранить настройки. Обновите данные и повторите.',
        ...(error instanceof ReminderConflict && error.proposal
          ? { proposal: error.proposal }
          : {}),
      },
      error instanceof ReminderConflict ? 409 : 400,
    )
  }
}

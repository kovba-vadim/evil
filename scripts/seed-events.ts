import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import type { Payload, PayloadRequest } from 'payload'
import { slugifyItemName } from '../src/fields/slugifyItemName'
import { EVENT_TIMES, validateEventTimes } from './seed-event-times'

export const EVENT_SCHEDULE = [
  ['Паромный терминал', '02:25 05:25 08:25 11:25 14:25 17:25 20:25 23:25'],
  ['Свалка', '02:30 05:30 08:30 11:30 14:30 17:30 20:30 23:30'],
  ['Караван', '02:55 05:55 08:55 11:55 14:55 17:55 20:55 23:55'],
  ['Триангуляция', '00:00 03:00 06:00 09:00 12:00 15:00 18:00 21:00'],
  ['Карго стандартный', '01:05 03:05 06:05 09:05 12:05 15:05 18:05 21:05 23:05'],
  ['Нападение зомби', '01:20 03:20 06:20 09:20 12:20 15:20 18:20 21:20'],
  ['Сделка', '00:25 03:25 06:25 09:25 12:25 15:25 18:25 21:25'],
  ['Подлодка', '00:30 03:30 06:30 09:30 12:30 15:30 18:30 21:30'],
  ['Крушение', '00:55 03:55 06:55 09:55 12:55 15:55 18:55 21:55'],
  ['Конвой', '01:00 04:00 07:00 10:00 13:00 16:00 19:00 22:00'],
  ['Спасти Ученого', '01:25 04:25 07:25 10:25 13:25 16:25 19:25 22:25'],
  ['Погрузка', '01:30 04:30 07:30 10:30 13:30 16:30 19:30 22:30'],
  ['Бронепоезд', '01:55 07:55 10:55 13:55 16:55 19:55 22:55'],
  ['Космос', '02:00 08:00 11:00 14:00 17:00 20:00 23:00'],
].map(([name, times]) => ({ name, times: times.split(' ') }))

class SeedError extends Error {}

export function validateEventSchedule(schedule = EVENT_SCHEDULE) {
  validateEventTimes(EVENT_TIMES)
  const names = schedule.map((event) => event.name)
  const slugs = names.map(slugifyItemName)
  const times = schedule.flatMap((event) => event.times)
  if (
    schedule.length !== 14 ||
    new Set(names).size !== 14 ||
    slugs.some((slug) => !slug) ||
    new Set(slugs).size !== 14 ||
    schedule.some(
      (event) =>
        !event.times.length ||
        event.times.some((time, index) => index > 0 && time <= event.times[index - 1]),
    ) ||
    times.length !== 111 ||
    new Set(times).size !== 111 ||
    EVENT_TIMES.some((time) => !times.includes(time))
  ) {
    throw new SeedError(
      'Некорректное расписание: нужны 14 уникальных ивентов и 111 уникальных времён из справочника, без 05:00.',
    )
  }
}

type Change = {
  name: string
  id: number | null
  launchTimes: number[]
  addedTimes: string[]
}
export type SeedPlan = {
  newEvents: number
  existingEvents: number
  missingLinks: number
  changes: Change[]
}

export async function planEvents(payload: Payload, req?: PayloadRequest): Promise<SeedPlan> {
  validateEventSchedule()
  const timeIDs = new Map<string, number>()
  // All transport pages; never assume the default limit contains all 111 times.
  for (let page = 1; ; page++) {
    const result = await payload.find({
      collection: 'event-times',
      where: { time: { in: EVENT_TIMES } },
      select: { time: true },
      sort: 'id',
      depth: 0,
      limit: 100,
      page,
      overrideAccess: true,
      req,
    })
    for (const doc of result.docs) {
      if (timeIDs.has(doc.time) && timeIDs.get(doc.time) !== doc.id)
        throw new SeedError(`Неоднозначное время: ${doc.time}. Запись отменена.`)
      timeIDs.set(doc.time, doc.id)
    }
    if (!result.hasNextPage) break
  }
  const missing = EVENT_TIMES.filter((time) => !timeIDs.has(time))
  if (missing.length)
    throw new SeedError(`В event-times отсутствуют: ${missing.join(', ')}. Запись отменена.`)

  const plan: SeedPlan = { newEvents: 0, existingEvents: 0, missingLinks: 0, changes: [] }
  for (const event of EVENT_SCHEDULE) {
    const result = await payload.find({
      collection: 'events',
      where: {
        or: [{ name: { equals: event.name } }, { slug: { equals: slugifyItemName(event.name) } }],
      },
      select: { name: true, slug: true, launchTimes: true },
      depth: 0,
      limit: 2,
      overrideAccess: true,
      req,
    })
    if (result.docs.length > 1 || result.hasNextPage)
      throw new SeedError(`Неоднозначное совпадение для «${event.name}». Запись отменена.`)
    const existing = result.docs[0]
    const ids = new Set(
      (existing?.launchTimes ?? []).map((value) => (typeof value === 'number' ? value : value.id)),
    )
    const addedTimes = event.times.filter((time) => !ids.has(timeIDs.get(time)!))
    for (const time of addedTimes) ids.add(timeIDs.get(time)!)
    if (existing) plan.existingEvents++
    else plan.newEvents++
    plan.missingLinks += addedTimes.length
    plan.changes.push({
      name: event.name,
      id: existing?.id ?? null,
      launchTimes: [...ids],
      addedTimes,
    })
  }
  const matched = plan.changes.flatMap((change) => (change.id == null ? [] : [change.id]))
  if (new Set(matched).size !== matched.length)
    throw new SeedError('Одна запись соответствует нескольким ивентам расписания. Запись отменена.')
  return plan
}

export async function seedEvents(payload: Payload, apply = false): Promise<SeedPlan> {
  if (!apply) return planEvents(payload)
  const { createLocalReq } = await import('payload')
  const req = await createLocalReq({}, payload)
  const transactionID = await payload.db.beginTransaction()
  if (transactionID == null) throw new SeedError('Не удалось начать транзакцию. Запись отменена.')
  req.transactionID = transactionID
  try {
    const plan = await planEvents(payload, req)
    for (const change of plan.changes) {
      // Trusted one-off administrative writes. Pass req through all operations
      // so collection hooks share this transaction and roll back together.
      if (change.id == null) {
        await payload.create({
          collection: 'events',
          // Empty slug triggers the project's existing beforeValidate generator.
          data: {
            name: change.name,
            slug: '',
            coins: 0,
            cooldownMinutes: 0,
            launchTimes: change.launchTimes,
          },
          depth: 0,
          overrideAccess: true,
          req,
        })
      } else if (change.addedTimes.length) {
        await payload.update({
          collection: 'events',
          id: change.id,
          data: { launchTimes: change.launchTimes },
          depth: 0,
          overrideAccess: true,
          req,
        })
      }
    }
    await payload.db.commitTransaction(transactionID)
    return plan
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (
    args.some((arg) => !['--check', '--apply'].includes(arg)) ||
    (args.includes('--check') && args.includes('--apply'))
  )
    throw new SeedError('Используйте --check, --apply или запуск без аргументов (предпросмотр).')
  validateEventSchedule()
  console.log('Расписание проверено: 14 ивентов, 111 запусков, UTC+3; 05:00 отсутствует.')
  if (args.includes('--check')) return
  if (process.env.PAYLOAD_DROP_DATABASE === 'true')
    throw new SeedError('PAYLOAD_DROP_DATABASE не допускается для заполнения справочника.')
  process.env.PAYLOAD_MIGRATING = 'true'
  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('../src/payload.config'),
  ])
  const payload = await getPayload({ config })
  try {
    const apply = args.includes('--apply')
    const plan = await seedEvents(payload, apply)
    console.log(
      `Новых ивентов: ${plan.newEvents}; существующих: ${plan.existingEvents}; недостающих связей: ${plan.missingLinks}.`,
    )
    for (const change of plan.changes) {
      console.log(
        `${change.id == null ? 'Создать' : change.addedTimes.length ? 'Дополнить' : 'Без изменений'}: ${change.name}; добавить: ${change.addedTimes.join(', ') || '—'}.`,
      )
    }
    console.log(
      apply
        ? 'Изменения сохранены одной транзакцией.'
        : 'Предпросмотр: записи не изменены. Для заполнения добавьте --apply.',
    )
  } finally {
    await payload.destroy()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Raw driver errors can contain credentials; print only our own safe errors.
    console.error(
      error instanceof SeedError
        ? error.message
        : 'Заполнение не завершено. Проверьте локальную конфигурацию PostgreSQL и доступность БД. Изменения транзакции не сохранены.',
    )
    process.exitCode = 1
  })
}

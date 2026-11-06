import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import type { Payload } from 'payload'

// Literal server times (UTC+3), without date or timezone conversion.
export const EVENT_TIMES = `
00:00, 00:25, 00:30, 00:55
01:00, 01:05, 01:20, 01:25, 01:30, 01:55
02:00, 02:25, 02:30, 02:55
03:00, 03:05, 03:20, 03:25, 03:30, 03:55
04:00, 04:25, 04:30
05:25, 05:30, 05:55
06:00, 06:05, 06:20, 06:25, 06:30, 06:55
07:00, 07:25, 07:30, 07:55
08:00, 08:25, 08:30, 08:55
09:00, 09:05, 09:20, 09:25, 09:30, 09:55
10:00, 10:25, 10:30, 10:55
11:00, 11:25, 11:30, 11:55
12:00, 12:05, 12:20, 12:25, 12:30, 12:55
13:00, 13:25, 13:30, 13:55
14:00, 14:25, 14:30, 14:55
15:00, 15:05, 15:20, 15:25, 15:30, 15:55
16:00, 16:25, 16:30, 16:55
17:00, 17:25, 17:30, 17:55
18:00, 18:05, 18:20, 18:25, 18:30, 18:55
19:00, 19:25, 19:30, 19:55
20:00, 20:25, 20:30, 20:55
21:00, 21:05, 21:20, 21:25, 21:30, 21:55
22:00, 22:25, 22:30, 22:55
23:00, 23:05, 23:25, 23:30, 23:55
`
  .trim()
  .split(/[\s,]+/)

export function validateEventTimes(times: readonly string[]) {
  if (
    times.length !== 111 ||
    new Set(times).size !== 111 ||
    times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) ||
    times.includes('05:00') ||
    times.some((time, index) => index > 0 && time <= times[index - 1])
  ) {
    throw new Error('Ожидалось 111 уникальных времён HH:mm по возрастанию, без 05:00.')
  }
}

export async function seedEventTimes(payload: Pick<Payload, 'find' | 'create'>, apply = false) {
  validateEventTimes(EVENT_TIMES)
  let existing = 0
  let missing = 0
  let created = 0
  for (const time of EVENT_TIMES) {
    // Trusted one-off administrative operation, explicitly bypassing user access.
    const result = await payload.find({
      collection: 'event-times',
      where: { time: { equals: time } },
      select: { time: true },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    if (result.docs.length) {
      existing++
      continue
    }
    missing++
    if (apply) {
      await payload.create({
        collection: 'event-times',
        // The existing beforeValidate hook derives minutes from time.
        data: { time, minutes: 0 },
        depth: 0,
        overrideAccess: true,
      })
      created++
    }
  }
  return { existing, missing, created }
}

async function main() {
  const args = process.argv.slice(2)
  if (
    args.some((arg) => !['--check', '--apply'].includes(arg)) ||
    (args.includes('--check') && args.includes('--apply'))
  ) {
    throw new Error('Используйте --check, --apply или запуск без аргументов (предпросмотр).')
  }
  validateEventTimes(EVENT_TIMES)
  console.log('Список проверен: 111 уникальных значений HH:mm, UTC+3; 05:00 отсутствует.')
  // Offline validation must never initialize Payload or connect to PostgreSQL.
  if (args.includes('--check')) return
  if (process.env.PAYLOAD_DROP_DATABASE === 'true') {
    throw new Error('PAYLOAD_DROP_DATABASE не допускается для заполнения справочника.')
  }
  // Match the existing backfill script: data only, never development schema push.
  process.env.PAYLOAD_MIGRATING = 'true'
  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('../src/payload.config'),
  ])
  const payload = await getPayload({ config })
  try {
    const apply = args.includes('--apply')
    const { existing, missing, created } = await seedEventTimes(payload, apply)
    console.log(`Уже существуют: ${existing}; отсутствовали: ${missing}; созданы: ${created}.`)
    if (!apply) console.log('Предпросмотр: записи не изменены. Для заполнения добавьте --apply.')
  } finally {
    await payload.destroy()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Do not print raw connection errors: they may contain database credentials.
    console.error(
      'Заполнение не завершено. Проверьте аргументы, список и локальную конфигурацию PostgreSQL. Повторный запуск пропустит уже созданные времена.',
    )
    process.exitCode = 1
  })
}

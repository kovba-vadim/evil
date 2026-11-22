import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import type { Payload } from 'payload'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'

export class DurationBackfillError extends Error {}
async function hasDurationColumn(payload: Payload) {
  const db = payload.db as unknown as PostgresAdapter
  const result = await db.drizzle.execute(
    sql`select 1 from information_schema.columns where table_schema = ${db.schemaName || 'public'} and table_name = 'events' and column_name = 'duration_minutes'`,
  )
  return result.rows.length > 0
}

export async function backfillEventDuration(payload: Payload, apply = false) {
  // Trusted data-only maintenance. The adapter avoids updatedAt and unrelated content hooks.
  // Its atomic conditional UPDATE touches only this one scalar, including on concurrent reruns.
  const transactionID = apply ? await payload.db.beginTransaction() : null
  if (apply && !transactionID)
    throw new DurationBackfillError('Для заполнения обязательна транзакция PostgreSQL.')
  const req = transactionID ? { transactionID } : undefined
  let total = 0,
    missing = 0,
    updated = 0,
    invalid = 0
  const ids: number[] = []
  try {
    for (let page = 1; ; page++) {
      const result = await payload.db.find<{
        id: number
        durationMinutes?: number | null
        updatedAt: string
      }>({
        collection: 'events',
        req,
        select: { id: true, durationMinutes: true, updatedAt: true },
        sort: 'id',
        limit: 100,
        page,
      })
      for (const event of result.docs) {
        total++
        if (event.durationMinutes !== null && event.durationMinutes !== undefined) {
          if (!Number.isSafeInteger(event.durationMinutes) || event.durationMinutes <= 0) invalid++
          continue
        }
        missing++
        ids.push(event.id)
        if (apply) {
          const saved = await payload.db.updateOne({
            collection: 'events',
            req,
            options: { atomic: true },
            where: {
              and: [
                { id: { equals: event.id } },
                { durationMinutes: { exists: false } },
                { updatedAt: { equals: event.updatedAt } },
              ],
            },
            data: { durationMinutes: 30, updatedAt: event.updatedAt },
          })
          if (saved) updated++
        }
      }
      if (!result.hasNextPage) break
    }
    if (transactionID) await payload.db.commitTransaction(transactionID)
  } catch (error) {
    if (transactionID && payload.db.sessions?.[transactionID])
      await payload.db.rollbackTransaction(transactionID)
    throw error
  }
  return { total, missing, updated, preserved: total - missing, invalid, ids }
}

function checkBackup(value?: string) {
  if (!value)
    throw new DurationBackfillError(
      'Для --apply укажите --backup с актуальным custom-архивом вне репозитория.',
    )
  const file = path.resolve(value),
    relative = path.relative(process.cwd(), file)
  if (!relative.startsWith('..') && !path.isAbsolute(relative))
    throw new DurationBackfillError('Резервная копия должна находиться вне репозитория.')
  const stat = fs.statSync(file)
  if (!stat.isFile() || stat.size === 0 || Date.now() - stat.mtimeMs > 24 * 3_600_000)
    throw new DurationBackfillError('Нужна непустая свежая резервная копия (не старше 24 часов).')
  const installed = 'C:/Program Files/PostgreSQL'
  const versions = fs.existsSync(installed)
    ? fs.readdirSync(installed).sort((a, b) => Number(b) - Number(a))
    : []
  const tool =
    versions
      .map((version) => path.join(installed, version, 'bin/pg_restore.exe'))
      .find((file) => fs.existsSync(file)) || 'pg_restore'
  const result = spawnSync(tool, ['--list', file], {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.status !== 0)
    throw new DurationBackfillError(
      'Резервная копия не прошла pg_restore --list. База не изменена.',
    )
}
async function main() {
  const args = process.argv.slice(2)
  const backupIndex = args.indexOf('--backup'),
    backup = backupIndex >= 0 ? args[backupIndex + 1] : undefined
  const switches = args.filter((_, index) => index !== backupIndex && index !== backupIndex + 1)
  // When --backup is absent, keep every argument (index 0 is not a backup value).
  const flags = backupIndex < 0 ? args : switches
  if (
    flags.some((flag) => !['--check', '--apply'].includes(flag)) ||
    (flags.includes('--check') && flags.includes('--apply'))
  )
    throw new DurationBackfillError('Используйте --check либо --apply --backup <путь>.')
  const apply = flags.includes('--apply')
  if (process.env.PAYLOAD_DROP_DATABASE === 'true' || process.env.NODE_ENV === 'production')
    throw new DurationBackfillError('Скрипт предназначен для локальной базы без сбросов.')
  if (apply) checkBackup(backup)
  // Never trigger a generic automatic push while inspecting or filling data.
  process.env.PAYLOAD_MIGRATING = 'true'
  const [{ getPayload }, { default: base }] = await Promise.all([
    import('payload'),
    import('../src/payload.config'),
  ])
  const config = await base
  const payload = await getPayload({ config })
  try {
    if (!(await hasDurationColumn(payload))) {
      if (!apply) {
        const count = await payload.count({ collection: 'events', overrideAccess: true })
        console.log(
          JSON.stringify({
            total: count.totalDocs,
            missing: count.totalDocs,
            updated: 0,
            schema:
              'Сначала примените добавочную схему Payload после резервного копирования. Скрипт схему не меняет.',
          }),
        )
        return
      }
      throw new DurationBackfillError(
        'Заполнение не начато: колонки durationMinutes ещё нет. Сначала безопасно примените добавочную схему Payload после резервного копирования.',
      )
    }
    const result = await backfillEventDuration(payload, apply)
    console.log(JSON.stringify(result))
    if (apply) {
      const verification = await backfillEventDuration(payload, false)
      if (verification.missing)
        throw new DurationBackfillError(
          'Остались незаполненные записи. Проверьте базу; повторный запуск безопасен.',
        )
      console.log(
        `Проверено в БД: ${verification.total}; отсутствующих значений: 0; обновлено: ${result.updated}.`,
      )
    } else console.log('Проверка: база не изменена. Применение: --apply --backup <custom-архив>.')
  } finally {
    await payload.destroy()
  }
}
// Payload's installed adapter destroy clears metadata but leaves its pg pool alive.
// Exit only after main has awaited every transaction and cleanup.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(
        error instanceof DurationBackfillError
          ? error.message
          : 'Заполнение не завершено. Проверьте локальную базу, схему и резервную копию; секретные диагностические данные скрыты.',
      )
      process.exit(1)
    })

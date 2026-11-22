import 'dotenv/config'
import type { Payload } from 'payload'
import type { Field } from 'payload'

/** Validate before importing the app config or initializing any database adapter. */
export function testDatabaseURL(
  target = process.env.EVIL_TEST_DATABASE_URL,
  working = process.env.DATABASE_URL,
): string {
  const fail = () => {
    throw new Error(
      'Configure an isolated EVIL_TEST_DATABASE_URL ending in _test; see docs/model-verification.md. Connection details are hidden.',
    )
  }
  if (!target || !working) return fail()
  let test: URL
  let live: URL
  let liveDatabase: string
  try {
    test = new URL(target)
    live = new URL(working)
    liveDatabase = decodeURIComponent(live.pathname).toLowerCase()
  } catch {
    return fail()
  }
  if (
    !['postgres:', 'postgresql:'].includes(test.protocol) ||
    !/^\/[a-z0-9_]+_test$/.test(test.pathname) ||
    test.pathname.toLowerCase() === liveDatabase ||
    test.search ||
    test.hash ||
    process.env.PAYLOAD_DROP_DATABASE === 'true' ||
    process.env.PAYLOAD_MIGRATING === 'true' ||
    process.env.NODE_ENV === 'production'
  )
    return fail()
  return target
}

export async function openTestPayload({
  mediaDirectory,
  nullableEventDuration = false,
}: { mediaDirectory?: string; nullableEventDuration?: boolean } = {}): Promise<Payload> {
  const connectionString = testDatabaseURL()
  const [{ getPayload }, { postgresAdapter }, { default: base }] = await Promise.all([
    import('payload'),
    import('@payloadcms/db-postgres'),
    import('../../src/payload.config'),
  ])
  const config = await base
  const legacyDurationFields = (fields: Field[]): Field[] =>
    fields.map((field) => {
      if (field.type === 'number' && field.name === 'durationMinutes')
        return { ...field, required: false, defaultValue: () => 30 }
      if ('fields' in field) return { ...field, fields: legacyDurationFields(field.fields) }
      if (field.type === 'tabs')
        return {
          ...field,
          tabs: field.tabs.map((tab) => ({ ...tab, fields: legacyDurationFields(tab.fields) })),
        }
      return field
    })
  return getPayload({
    key: `isolated-model-test-${crypto.randomUUID()}`,
    config: {
      ...config,
      // Upload fixtures must not use the application's real Media directory.
      collections: config.collections.map((collection) => {
        if (mediaDirectory && collection.slug === 'media' && collection.upload)
          return { ...collection, upload: { ...collection.upload, staticDir: mediaDirectory } }
        if (nullableEventDuration && collection.slug === 'events')
          return {
            ...collection,
            fields: legacyDurationFields(collection.fields),
            flattenedFields: collection.flattenedFields.map((field) =>
              field.type === 'number' && field.name === 'durationMinutes'
                ? { ...field, required: false, defaultValue: () => 30 }
                : field,
            ),
          }
        return collection
      }),
      // Explicitly replace the adapter: never swap or reuse the working DATABASE_URL.
      db: {
        ...postgresAdapter({
          pool: { connectionString },
          push: process.env.EVIL_TEST_SCHEMA_PUSH !== 'false',
          disableCreateDatabase: true,
        }),
        allowIDOnCreate: false,
        name: 'postgres',
      },
      secret: 'isolated-model-tests-only-not-a-production-secret',
    },
  })
}

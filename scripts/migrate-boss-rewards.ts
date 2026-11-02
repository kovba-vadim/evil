import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { withLegacyBossRewards } from '../src/hooks/bossRewards'

// Data backfill only: apply the additive development schema separately first.
// Prevent this script from pushing or dropping a schema.
if (process.env.PAYLOAD_DROP_DATABASE === 'true') {
  throw new Error('PAYLOAD_DROP_DATABASE must not be enabled for a data backfill.')
}
process.env.PAYLOAD_MIGRATING = 'true'

const apply = process.argv.includes('--apply')
const backupIndex = process.argv.indexOf('--backup')
const backupPath = backupIndex >= 0 ? process.argv[backupIndex + 1] : undefined
if (apply && (!backupPath || backupPath.startsWith('--'))) {
  throw new Error('Use --apply --backup <new-file.json>; the backup file must not already exist.')
}

const payload = await getPayload({ config })
try {
  // Trusted administrative read: include every boss and all legacy dependencies.
  const { docs } = await payload.find({
    collection: 'bosses',
    pagination: false,
    depth: 0,
    overrideAccess: true,
    sort: 'id',
  })
  const pending = docs.filter((doc) => doc.goldenHeart != null || doc.personalHeart != null)
  console.log(`Bosses: ${docs.length}; pending legacy rewards: ${pending.length}.`)
  if (apply && pending.length) {
    // Exclusive creation: never overwrite a previous backup, and write before updating.
    await writeFile(resolve(backupPath!), JSON.stringify(docs, null, 2), { flag: 'wx' })
    for (const doc of pending) {
      const expected = withLegacyBossRewards(doc)
      // Do not replay an old snapshot over concurrent edits.
      await payload.update({
        collection: 'bosses',
        id: doc.id,
        data: {},
        depth: 0,
        overrideAccess: true,
      })
      const saved = await payload.findByID({
        collection: 'bosses',
        id: doc.id,
        depth: 0,
        overrideAccess: true,
      })
      if (
        saved.goldenHeart != null ||
        saved.personalHeart != null ||
        expected.some((reward) => {
          const id = typeof reward.resource === 'object' ? reward.resource.id : reward.resource
          return !saved.rewards?.some((row) => {
            const savedID = typeof row.resource === 'object' ? row.resource.id : row.resource
            return String(savedID) === String(id) && row.quantity === reward.quantity
          })
        })
      ) {
        throw new Error(`Backfill verification failed for boss ${doc.id}; keep legacy columns.`)
      }
    }
    console.log(`Backfilled and verified: ${pending.length}. Keep the legacy columns until review.`)
  }
} finally {
  await payload.destroy()
}

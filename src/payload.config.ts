import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { OrdinaryItems } from './collections/OrdinaryItems'
import { Resources } from './collections/Resources'
import { EquipmentSets } from './collections/EquipmentSets'
import { Clothing } from './collections/Clothing'
import { Weapons } from './collections/Weapons'
import { EventTimes } from './collections/EventTimes'
import { Events } from './collections/Events'
import { Quests } from './collections/Quests'
import { Bosses } from './collections/Bosses'
import { QuestCategories } from './collections/QuestCategories'
import { CatalogSeo } from './globals/CatalogSeo'
import { Homepage } from './globals/Homepage'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    OrdinaryItems,
    Resources,
    EquipmentSets,
    Clothing,
    Weapons,
    EventTimes,
    Events,
    Quests,
    QuestCategories,
    Bosses,
  ],
  globals: [Homepage, ...CatalogSeo],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
})

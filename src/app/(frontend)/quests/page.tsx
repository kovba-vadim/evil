import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getPublicQuests, getQuestCategories, questCatalogOptions } from '@/queries/public-quests'
import { QuestCatalog } from '@/components/public/quest-catalog'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Квесты' }
export default async function Page() {
  const payload = await getPayload({ config })
  const [quests, categories] = await Promise.all([
    getPublicQuests(payload),
    getQuestCategories(payload),
  ])
  return <QuestCatalog initial={quests} options={questCatalogOptions(quests, categories)} />
}

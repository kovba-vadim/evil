import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCraftCatalog } from '@/queries/public-items'
import { ItemCards } from '@/components/public/resource-catalog'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Craft' }
export default async function Page() {
  const items = await getCraftCatalog(await getPayload({ config }))
  return (
    <section aria-labelledby="craft-title" className="space-y-6">
      <h1 id="craft-title" className="text-3xl font-semibold tracking-tight">
        Craft
      </h1>
      <ItemCards items={items} showType emptyMessage="Предметы для крафта пока не добавлены." />
    </section>
  )
}

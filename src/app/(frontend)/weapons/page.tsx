import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getEquipmentCatalog } from '@/queries/public-items'
import { ItemCards } from '@/components/public/resource-catalog'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Кастом оружие' }
export default async function Page() {
  const payload = await getPayload({ config })
  const items = await getEquipmentCatalog(payload, 'weapons')
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Кастом оружие</h1>
      <ItemCards items={items} collection="weapons" emptyMessage="Оружие пока не добавлено." />
    </section>
  )
}

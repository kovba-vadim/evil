import { getPageMetadata } from '@/queries/public-seo'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getEquipmentCatalog } from '@/queries/public-items'
import { ItemCards } from '@/components/public/resource-catalog'
export const dynamic = 'force-dynamic'
export function generateMetadata() {
  return getPageMetadata('clothing-page')
}
export default async function Page() {
  const payload = await getPayload({ config })
  const [sets, hazmats] = await Promise.all([
    getEquipmentCatalog(payload, 'equipment-sets'),
    getEquipmentCatalog(payload, 'clothing'),
  ])
  return (
    <section className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Кастом одежда</h1>
      <section aria-labelledby="sets-title" className="space-y-6">
        <h2 id="sets-title" className="text-xl font-semibold">
          Сеты
        </h2>
        <ItemCards
          items={sets}
          collection="equipment-sets"
          emptyMessage="Сеты пока не добавлены."
        />
      </section>
      <section aria-labelledby="hazmats-title" className="space-y-6">
        <h2 id="hazmats-title" className="text-xl font-semibold">
          Хазматы
        </h2>
        <ItemCards
          items={hazmats}
          collection="clothing"
          emptyMessage="Хазматы пока не добавлены."
        />
      </section>
    </section>
  )
}

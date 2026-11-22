import { getPageMetadata } from '@/queries/public-seo'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getEquipmentCatalog } from '@/queries/public-items'
import { ItemCards } from '@/components/public/resource-catalog'
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClothingTabs } from '@/components/public/clothing-tabs'
import './clothing.scss'

const emptyMessage = 'В этой категории пока нет предметов'

export const dynamic = 'force-dynamic'
export function generateMetadata() {
  return getPageMetadata('clothing-page')
}
export default async function Page() {
  const payload = await getPayload({ config })
  const [sets, hazmats, rings] = await Promise.all([
    getEquipmentCatalog(payload, 'equipment-sets'),
    getEquipmentCatalog(payload, 'clothing', { where: { category: { equals: 'hazmat' } } }),
    getEquipmentCatalog(payload, 'clothing', { where: { category: { equals: 'ring' } } }),
  ])
  return (
    <section className="clothing-catalog space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Кастом одежда</h1>
      <ClothingTabs>
        <TabsList aria-label="Категории одежды" className="grid h-11 w-full max-w-sm grid-cols-3">
          <TabsTrigger value="sets" className="h-full px-1">
            Сеты
          </TabsTrigger>
          <TabsTrigger value="hazmats" className="h-full px-1">
            Хазматы
          </TabsTrigger>
          <TabsTrigger value="rings" className="h-full px-1">
            Кольца
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sets">
          <ItemCards items={sets} collection="equipment-sets" emptyMessage={emptyMessage} />
        </TabsContent>
        <TabsContent value="hazmats">
          <ItemCards items={hazmats} collection="clothing" emptyMessage={emptyMessage} />
        </TabsContent>
        <TabsContent value="rings">
          <ItemCards items={rings} collection="clothing" emptyMessage={emptyMessage} />
        </TabsContent>
      </ClothingTabs>
    </section>
  )
}

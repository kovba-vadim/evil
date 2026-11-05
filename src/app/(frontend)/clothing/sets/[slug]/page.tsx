import { getEntryMetadata } from '@/queries/public-seo'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getSetDetail } from '@/queries/public-items'
import { ItemHeading } from '@/components/public/item-detail'
import { ItemCards } from '@/components/public/resource-catalog'
export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return getEntryMetadata('equipment-sets', (await params).slug, 'Сет')
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const detail = await getSetDetail(await getPayload({ config }), slug)
  if (!detail) notFound()
  return (
    <article className="space-y-9">
      <ItemHeading item={detail.item} />
      <section aria-labelledby="parts-title" className="space-y-6">
        <h2 id="parts-title" className="text-xl font-semibold">
          Состав сета
        </h2>
        <ItemCards
          items={detail.parts}
          collection="clothing"
          emptyMessage="Части сета пока не добавлены."
        />
      </section>
    </article>
  )
}

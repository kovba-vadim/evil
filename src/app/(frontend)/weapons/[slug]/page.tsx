import { getEntryMetadata } from '@/queries/public-seo'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { EquipmentDetails } from '@/components/public/item-detail'
import { getEquipmentDetail } from '@/queries/public-items'
export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return getEntryMetadata('weapons', (await params).slug, 'Оружие')
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getEquipmentDetail(await getPayload({ config }), 'weapons', slug)
  if (!data) notFound()
  return <EquipmentDetails detail={data} />
}

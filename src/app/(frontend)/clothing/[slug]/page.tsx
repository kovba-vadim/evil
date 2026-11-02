import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { EquipmentDetails } from '@/components/public/item-detail'
import { getEquipmentDetail } from '@/queries/public-items'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Одежда' }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getEquipmentDetail(await getPayload({ config }), 'clothing', slug)
  if (!data) notFound()
  return <EquipmentDetails detail={data} />
}

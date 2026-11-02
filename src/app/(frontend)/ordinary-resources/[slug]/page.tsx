import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { OrdinaryDetails } from '@/components/public/item-detail'
import { getOrdinaryItem } from '@/queries/public-items'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Обычный ресурс' }

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getOrdinaryItem(await getPayload({ config }), slug)
  if (!data) notFound()
  return <OrdinaryDetails item={data} />
}

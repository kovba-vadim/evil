import { getEntryMetadata } from '@/queries/public-seo'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ResourceDetails } from '@/components/public/item-detail'
import { getResourceDetail } from '@/queries/public-items'

export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return getEntryMetadata('resources', (await params).slug, 'Кастомный предмет')
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getResourceDetail(await getPayload({ config }), slug)
  if (!data) notFound()
  return <ResourceDetails detail={data} />
}

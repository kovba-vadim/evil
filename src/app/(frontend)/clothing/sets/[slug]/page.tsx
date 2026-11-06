import { getEntryMetadata } from '@/queries/public-seo'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getSetDetail } from '@/queries/public-items'
import { SetDetails } from '@/components/public/set-detail'
export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return getEntryMetadata('equipment-sets', (await params).slug, 'Сет')
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const detail = await getSetDetail(await getPayload({ config }), slug)
  if (!detail) notFound()
  return <SetDetails detail={detail} />
}

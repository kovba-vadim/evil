import { getEntryMetadata } from '@/queries/public-seo'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getBossDetail } from '@/queries/public-items'
import { BossDetails } from '@/components/public/bosses'
export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return getEntryMetadata('bosses', (await params).slug, 'Ивент-босс')
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const detail = await getBossDetail(await getPayload({ config }), slug)
  if (!detail) notFound()
  return <BossDetails detail={detail} />
}

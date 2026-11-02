import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getBossDetail } from '@/queries/public-items'
import { BossDetails } from '@/components/public/bosses'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ивент-босс' }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const detail = await getBossDetail(await getPayload({ config }), slug)
  if (!detail) notFound()
  return <BossDetails detail={detail} />
}

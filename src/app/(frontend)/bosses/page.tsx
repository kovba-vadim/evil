import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getBossCatalog } from '@/queries/public-items'
import { BossCatalog } from '@/components/public/bosses'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ивент-боссы' }
export default async function Page() {
  return <BossCatalog items={await getBossCatalog(await getPayload({ config }))} />
}

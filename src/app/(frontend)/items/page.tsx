import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getResourceCatalog } from '@/queries/public-items'
import { ResourceCatalog } from '@/components/public/resource-catalog'

export const metadata: Metadata = { title: 'Кастом предметы' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  const payload = await getPayload({ config })
  return <ResourceCatalog items={await getResourceCatalog(payload)} />
}

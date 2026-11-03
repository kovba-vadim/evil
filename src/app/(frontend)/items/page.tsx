import { getPageMetadata } from '@/queries/public-seo'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getResourceCatalog } from '@/queries/public-items'
import { ResourceCatalog } from '@/components/public/resource-catalog'

export function generateMetadata() {
  return getPageMetadata('items-page')
}
export const dynamic = 'force-dynamic'

export default async function Page() {
  const payload = await getPayload({ config })
  return <ResourceCatalog items={await getResourceCatalog(payload)} />
}

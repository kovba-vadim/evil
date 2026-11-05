import { getPageMetadata } from '@/queries/public-seo'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getBossCatalog } from '@/queries/public-items'
import { BossCatalog } from '@/components/public/bosses'
export const dynamic = 'force-dynamic'
export function generateMetadata() {
  return getPageMetadata('bosses-page')
}
export default async function Page() {
  return <BossCatalog items={await getBossCatalog(await getPayload({ config }))} />
}

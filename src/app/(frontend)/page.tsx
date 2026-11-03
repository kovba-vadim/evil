import { getPageMetadata } from '@/queries/public-seo'
import { getPayload } from 'payload'
import config from '@payload-config'
import { HomepageContent } from '@/components/public/homepage-content'
import { getHomepage } from '@/queries/getHomepage'

// Read the current saved Global on every request, without a build-time snapshot.
export const dynamic = 'force-dynamic'

export function generateMetadata() {
  return getPageMetadata('homepage')
}

export default async function HomePage() {
  const payload = await getPayload({ config })
  const homepage = await getHomepage(payload)
  return <HomepageContent homepage={homepage} />
}

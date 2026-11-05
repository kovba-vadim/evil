import { getPageMetadata } from '@/queries/public-seo'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getPublicSchedule } from '@/queries/public-launches'
import { getPublicEvents, eventCatalogOptions } from '@/queries/public-events'
import { LaunchSchedule } from '@/components/public/launch-schedule'
export const dynamic = 'force-dynamic'
export function generateMetadata() {
  return getPageMetadata('event-launches-page')
}
export default async function Page() {
  const payload = await getPayload({ config }),
    now = new Date().toISOString()
  const [initial, events] = await Promise.all([
    getPublicSchedule(payload, { zone: 'server' }, now),
    getPublicEvents(payload),
  ])
  return <LaunchSchedule initial={initial} options={eventCatalogOptions(events)} />
}

import { getPageMetadata } from '@/queries/public-seo'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getPublicEvents, eventCatalogOptions } from '@/queries/public-events'
import { EventCatalog } from '@/components/public/event-catalog'
export const dynamic = 'force-dynamic'
export function generateMetadata() {
  return getPageMetadata('events-page')
}
export default async function Page() {
  const events = await getPublicEvents(await getPayload({ config }))
  return <EventCatalog initial={events} options={eventCatalogOptions(events)} />
}

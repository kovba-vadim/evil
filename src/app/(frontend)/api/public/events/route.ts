import { getPayload } from 'payload'
import config from '@payload-config'
import { getPublicEvents, parsePublicEventFilters } from '@/queries/public-events'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  let filters
  try {
    filters = parsePublicEventFilters(await request.json())
  } catch {
    return Response.json({ error: 'Некорректные фильтры.' }, { status: 400 })
  }
  const events = await getPublicEvents(await getPayload({ config }), filters)
  return Response.json(events, { headers: { 'Cache-Control': 'no-store' } })
}

import { getPayload } from 'payload'
import config from '@payload-config'
import { getPublicSchedule, parseScheduleFilters } from '@/queries/public-launches'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  let filters
  try {
    filters = parseScheduleFilters(await request.json())
  } catch {
    return Response.json({ error: 'Некорректные параметры расписания.' }, { status: 400 })
  }
  return Response.json(
    await getPublicSchedule(await getPayload({ config }), filters, new Date().toISOString()),
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

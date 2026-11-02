import { getPayload } from 'payload'
import config from '@payload-config'
import { getPublicQuests, parseQuestFilters } from '@/queries/public-quests'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  let filters
  try {
    filters = parseQuestFilters(await request.json())
  } catch {
    return Response.json({ error: 'Некорректные фильтры.' }, { status: 400 })
  }
  return Response.json(await getPublicQuests(await getPayload({ config }), filters), {
    headers: { 'Cache-Control': 'no-store' },
  })
}

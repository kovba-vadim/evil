import { getPayload } from 'payload'
import config from '@payload-config'
import { parseSearchQuery } from '@/lib/search'
import { searchPublicCatalog } from '@/queries/public-search'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const values = new URL(request.url).searchParams.getAll('q')
  let query: string
  try {
    if (values.length > 1) throw new Error('Repeated query')
    query = parseSearchQuery(values[0] ?? '')
  } catch {
    return Response.json(
      { error: 'Некорректный поисковый запрос. Максимум 100 символов.' },
      { status: 400 },
    )
  }
  // Short/empty queries must not initialize Payload or touch the database.
  if (Array.from(query).length < 2)
    return Response.json({ results: [], more: [] }, { headers: { 'Cache-Control': 'no-store' } })
  return Response.json(await searchPublicCatalog(await getPayload({ config }), query), {
    headers: { 'Cache-Control': 'no-store' },
  })
}

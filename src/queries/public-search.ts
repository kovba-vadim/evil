import type { Payload } from 'payload'
import {
  SEARCH_TYPES,
  SEARCH_MIN_LENGTH,
  parseSearchQuery,
  searchLength,
  type SearchResponse,
} from '../lib/search'
import { publicRecordURL } from '../lib/public-record-url'
const literalPattern = (query: string) => query.replace(/[\\%_]/g, '\\$&')
/** Narrow metadata only; page every match before ranking. Retain at most six candidates per type. */
export async function searchPublicCatalog(
  payload: Payload,
  value: unknown,
  { pageSize = 100 }: { pageSize?: number } = {},
): Promise<SearchResponse> {
  const query = parseSearchQuery(value)
  if (searchLength(query) < SEARCH_MIN_LENGTH) return { results: [], more: [] }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new RangeError('pageSize must be positive.')
  const needle = query.toLocaleLowerCase('ru')
  const groups = await Promise.all(
    SEARCH_TYPES.map(async ({ kind, label }, typeOrder) => {
      const matches: { id: number; name: string; slug: string; rank: number }[] = []
      for (let page = 1; ; page++) {
        const result = await payload.find({
          collection: kind,
          where: { name: { contains: literalPattern(query) } },
          select: { name: true, slug: true },
          sort: 'id',
          limit: pageSize,
          page,
          depth: 0,
          overrideAccess: false,
          user: null,
        })
        for (const { id, name, slug } of result.docs) {
          const folded = name.toLocaleLowerCase('ru')
          if (!folded.includes(needle)) continue
          const rank = folded === needle ? 0 : folded.startsWith(needle) ? 1 : 2
          if (!matches.some((row) => row.id === id)) matches.push({ id, name, slug, rank })
          matches.sort((a, b) => a.rank - b.rank || a.id - b.id)
          if (matches.length > 6) matches.length = 6
        }
        if (!result.hasNextPage) break
      }
      return { kind, label, typeOrder, more: matches.length > 5, matches: matches.slice(0, 5) }
    }),
  )
  const results = groups.flatMap((group) =>
    group.matches.map((match) => ({
      rank: match.rank,
      typeOrder: group.typeOrder,
      result: {
        key: `${group.kind}:${match.id}`,
        id: match.id,
        kind: group.kind,
        label: group.label,
        name: match.name,
        href: publicRecordURL(group.kind, match.slug)!,
      },
    })),
  )
  results.sort((a, b) => a.rank - b.rank || a.typeOrder - b.typeOrder || a.result.id - b.result.id)
  return {
    results: results.map((row) => row.result),
    more: groups.filter((group) => group.more).map(({ kind, label }) => ({ kind, label })),
  }
}

import type { CollectionSlug, DataFromCollectionSlug, Payload, Where } from 'payload'
import type { User } from '../../src/payload-types'

type Reader = { api: Payload; user: User & { collection: 'users' } }

/** Test-only query recipe. No routes, UI or production filtering service. */
export async function readAll<T extends CollectionSlug>(
  { api, user }: Reader,
  collection: T,
  where: Where,
  limit = 2,
): Promise<DataFromCollectionSlug<T>[]> {
  const docs: DataFromCollectionSlug<T>[] = []
  for (let page = 1; ; page++) {
    const result = await api.find({
      collection,
      where,
      limit,
      page,
      sort: 'id',
      depth: 0,
      user,
      overrideAccess: false,
    })
    docs.push(...result.docs)
    if (!result.hasNextPage) return docs
  }
}

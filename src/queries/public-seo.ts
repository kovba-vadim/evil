import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { catalogTitles } from '@/globals/CatalogSeo'

type Seo = { title?: string | null; description?: string | null } | null | undefined

function metadata(seo: Seo, fallbackTitle: string): Metadata {
  const description = seo?.description?.trim()
  return {
    title: seo?.title?.trim() || fallbackTitle,
    ...(description ? { description } : {}),
  }
}

export async function getPageMetadata(slug: keyof typeof catalogTitles | 'homepage') {
  const payload = await getPayload({ config })
  const page = await payload.findGlobal({ slug, depth: 0, overrideAccess: false, user: null })
  return metadata(page.seo, slug === 'homepage' ? 'EvilIsland' : catalogTitles[slug])
}

export async function getEntryMetadata(
  collection: 'bosses' | 'events' | 'quests' | 'resources' | 'ordinary-items' | 'weapons' | 'clothing' | 'equipment-sets',
  slug: string,
  fallbackTitle: string,
) {
  const payload = await getPayload({ config })
  const { docs: [entry] } = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    select: { name: true, seo: true },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: null,
  })

  return metadata(entry?.seo, entry?.name || fallbackTitle)
}

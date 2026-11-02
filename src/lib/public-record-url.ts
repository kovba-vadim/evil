import type { CollectionSlug } from 'payload'

/** Add a collection only once its canonical detail page actually exists. */
export function publicRecordURL(collection: CollectionSlug, slug: string): string | undefined {
  const segment = encodeURIComponent(slug)
  if (collection === 'resources') return `/items/${segment}`
  if (collection === 'ordinary-items') return `/ordinary-resources/${segment}`
  if (collection === 'clothing') return `/clothing/${segment}`
  if (collection === 'weapons') return `/weapons/${segment}`
  if (collection === 'equipment-sets') return `/clothing/sets/${segment}`
  if (collection === 'bosses') return `/bosses/${segment}`
  if (collection === 'events') return `/events/${segment}`
  if (collection === 'quests') return `/quests/${segment}`
  return undefined
}

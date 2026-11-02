import type {
  CollectionSlug,
  DataFromCollectionSlug,
  Payload,
  RequiredDataFromCollectionSlug,
} from 'payload'

export class ModelFixtures {
  readonly prefix = `model-test-${crypto.randomUUID()}`
  private entries: { collection: CollectionSlug; id: number | string }[] = []
  private sequence = 0

  constructor(readonly api: Payload) {}

  name() {
    return `${this.prefix}-${++this.sequence}`
  }

  async create<T extends CollectionSlug>(
    collection: T,
    data: RequiredDataFromCollectionSlug<T>,
  ): Promise<DataFromCollectionSlug<T>> {
    // Trusted fixture setup/cleanup deliberately bypasses access. Assertions use false.
    const doc = await this.api.create({ collection, data, overrideAccess: true, depth: 0 })
    this.entries.push({ collection, id: doc.id })
    return doc
  }

  async cleanup() {
    const errors: unknown[] = []
    for (const entry of this.entries.filter(({ collection }) => collection === 'resources')) {
      try {
        const exists = await this.api.find({
          collection: 'resources',
          where: { id: { equals: entry.id } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (exists.docs.length)
          await this.api.update({
            collection: 'resources',
            id: entry.id,
            data: {
              craftable: false,
              recipe: { resourceIngredients: [], ordinaryIngredients: [], coins: 0 },
            },
            overrideAccess: true,
          })
      } catch (error) {
        errors.push(error)
      }
    }
    const order: CollectionSlug[] = [
      'bosses',
      'quests',
      'events',
      'clothing',
      'weapons',
      'resources',
      'equipment-sets',
      'quest-categories',
      'event-times',
      'ordinary-items',
      'users',
    ]
    for (const collection of order) {
      for (const entry of this.entries
        .filter((entry) => entry.collection === collection)
        .reverse()) {
        try {
          // A test may already have deleted its own fixture successfully.
          const exists = await this.api.find({
            collection,
            where: { id: { equals: entry.id } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          if (exists.docs.length)
            await this.api.delete({ collection, id: entry.id, overrideAccess: true })
        } catch (error) {
          errors.push(error)
        }
      }
    }
    if (errors.length)
      throw new AggregateError(
        errors,
        'Test fixture cleanup failed; inspect only the dedicated test database.',
      )
  }
}

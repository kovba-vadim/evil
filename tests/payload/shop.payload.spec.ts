import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { ModelFixtures } from '../helpers/modelFixtures'
import { openTestPayload } from '../helpers/testDatabase'

const collections = [
  'equipment-sets',
  'clothing',
  'weapons',
  'resources',
  'ordinary-items',
] as const
const offer = { enabled: true, price: 499, url: 'https://shop.example.test/product' }

describe('shop offers through Payload', () => {
  let api: Payload
  let fixtures: ModelFixtures
  const named = () => ({ name: fixtures.name(), slug: fixtures.name() })

  beforeAll(async () => {
    api = await openTestPayload()
  }, 60000)
  afterAll(async () => {
    await api.destroy()
  }, 60000)
  beforeEach(() => {
    fixtures = new ModelFixtures(api)
  })
  afterEach(async () => {
    await fixtures.cleanup()
  }, 60000)

  it.each(collections)('validates and publishes shop offers for %s', async (collection) => {
    const item = await fixtures.create(collection, {
      ...named(),
      ...(collection === 'clothing' ? { category: 'ring' as const } : {}),
    })
    expect(item.shop?.enabled).toBe(false)
    const patch = (shop: NonNullable<typeof item.shop>) =>
      api.update({ collection, id: item.id, data: { shop }, depth: 0, overrideAccess: true })
    const read = () =>
      api.findByID({
        collection,
        id: item.id,
        depth: 0,
        user: null,
        overrideAccess: false,
      })
    expect(await read()).not.toHaveProperty('shop')
    await expect(patch({ enabled: true })).rejects.toMatchObject({ status: 400 })
    await expect(
      patch({ ...offer, url: 'http://shop.example.test/product' }),
    ).resolves.toMatchObject({
      shop: { ...offer, url: 'http://shop.example.test/product' },
    })
    await patch(offer)
    expect(await read()).toMatchObject({ shop: offer })
    await expect(patch({ price: null })).rejects.toMatchObject({ status: 400 })
    await expect(patch({ url: null })).rejects.toMatchObject({ status: 400 })
    await expect(patch({ enabled: false })).resolves.toMatchObject({
      shop: { ...offer, enabled: false },
    })
    expect(await read()).not.toHaveProperty('shop')
    await expect(patch({ enabled: true })).resolves.toMatchObject({ shop: offer })
  })

  it('rejects invalid prices and URLs, including on partial updates', async () => {
    const item = await fixtures.create('resources', { ...named(), shop: offer })
    const patch = (shop: NonNullable<typeof item.shop>) =>
      api.update({ collection: 'resources', id: item.id, data: { shop }, overrideAccess: true })
    for (const price of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(patch({ price })).rejects.toMatchObject({ status: 400 })
    }
    for (const url of [
      '',
      '/product',
      '//shop.example.test',
      'https:/example.test',
      'https://',
      'javascript:alert(1)',
      'data:text/plain,offer',
      'ftp://shop.example.test',
    ]) {
      await expect(patch({ url })).rejects.toMatchObject({ status: 400 })
    }
    await expect(patch({ enabled: 'yes' as never })).rejects.toMatchObject({ status: 400 })
    await expect(patch(null as never)).resolves.toMatchObject({
      shop: { ...offer, enabled: false },
    })
  })

  it('keeps set parts unavailable and preserves relationships and recipe on safe transitions', async () => {
    const set = await fixtures.create('equipment-sets', named())
    const resource = await fixtures.create('ordinary-items', named())
    const recipe = { coins: 2, ordinaryIngredients: [{ item: resource.id, quantity: 1 }] }
    const item = await fixtures.create('clothing', {
      ...named(),
      category: 'hazmat',
      craftable: true,
      recipe,
      shop: offer,
    })
    const transition = { category: 'set' as const, equipmentSet: set.id }
    await expect(
      api.create({
        collection: 'clothing',
        data: { ...named(), ...transition, shop: offer },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 400 })
    const patch = (data: { category?: 'set'; equipmentSet?: number; shop?: typeof item.shop }) =>
      api.update({ collection: 'clothing', id: item.id, data, depth: 0, overrideAccess: true })
    await expect(patch(transition)).rejects.toMatchObject({ status: 400 })
    await expect(patch({ ...transition, shop: { enabled: false } })).resolves.toMatchObject({
      ...transition,
      recipe,
      shop: { ...offer, enabled: false },
    })
    await expect(patch({ shop: { enabled: true } })).rejects.toMatchObject({ status: 400 })
    expect(
      await api.findByID({
        collection: 'clothing',
        id: item.id,
        depth: 0,
        overrideAccess: false,
        user: null,
      }),
    ).not.toHaveProperty('shop')
  })
})

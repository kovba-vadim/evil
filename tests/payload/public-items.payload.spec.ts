import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { Boss } from '../../src/payload-types'
import { mkdtemp, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import {
  getEquipmentDetail,
  getEquipmentCatalog,
  getCraftCatalog,
  getBossCatalog,
  getBossDetail,
  getSetDetail,
  getOrdinaryItem,
  getResourceCatalog,
  getResourceDetail,
} from '../../src/queries/public-items'
import { publicRecordURL } from '../../src/lib/public-record-url'
import { ResourceCatalog } from '../../src/components/public/resource-catalog'
import { ResourceDetails } from '../../src/components/public/item-detail'

let api: Payload
let fixtures: ModelFixtures
let mediaDirectory: string
let mediaID: number | undefined
const named = () => {
  const name = fixtures.name()
  return { name, slug: name }
}

beforeAll(async () => {
  mediaDirectory = await mkdtemp(join(tmpdir(), 'evil-items-test-'))
  api = await openTestPayload({ mediaDirectory })
})
beforeEach(() => {
  fixtures = new ModelFixtures(api)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fixtures.cleanup()
  if (mediaID !== undefined) {
    await api.delete({ collection: 'media', id: mediaID, overrideAccess: true })
    mediaID = undefined
  }
})
afterAll(async () => {
  await api?.destroy()
  if (mediaDirectory) await rmdir(mediaDirectory)
})

describe('public item pages through real Payload/PostgreSQL', () => {
  it('returns a complete ordered catalog, batches shared images and excludes recipe payloads', async () => {
    const data = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
      'base64',
    )
    const media = await api.create({
      collection: 'media',
      data: { alt: 'Тестовая картинка' },
      file: { data, mimetype: 'image/png', name: `${fixtures.name()}.png`, size: data.length },
      overrideAccess: true,
    })
    mediaID = media.id
    const docs = []
    for (let i = 0; i < 12; i++)
      docs.push(await fixtures.create('resources', { ...named(), image: media.id }))
    const expected = [...docs].reverse()
    for (const [index, doc] of expected.entries())
      await api.update({
        collection: 'resources',
        id: doc.id,
        data: { _order: `a${'0123456789AB'[index]}` },
        overrideAccess: true,
      })
    const scope = { slug: { contains: fixtures.prefix } }
    const paged = await getResourceCatalog(api, { pageSize: 2, where: scope })
    expect(paged.map(({ id }) => id)).toEqual(expected.map(({ id }) => id))
    expect(paged.every((item) => item.image?.id === media.id)).toBe(true)
    expect(paged.every((item) => item.image?.url?.includes(media.filename!))).toBe(true)
    expect(paged.some((item) => 'recipe' in item)).toBe(false)
    const spy = vi.spyOn(api, 'find')
    await getResourceCatalog(api, { where: scope })
    expect(spy).toHaveBeenCalledTimes(2) // one catalog query, one Media batch, never per card
  })

  it('renders an empty catalog, image placeholders and returns null only for unknown slugs', async () => {
    const empty = await getResourceCatalog(api, { where: { slug: { equals: fixtures.prefix } } })
    expect(renderToStaticMarkup(createElement(ResourceCatalog, { items: empty }))).toContain(
      'Кастомные предметы пока не добавлены.',
    )
    const item = await fixtures.create('resources', named())
    const detail = await getResourceDetail(api, item.slug)
    expect(detail).not.toBeNull()
    const html = renderToStaticMarkup(createElement(ResourceDetails, { detail: detail! }))
    expect(html).toContain('Нет изображения')
    for (const heading of ['Где получить', 'Как скрафтить', 'Используется в крафте'])
      expect(html).not.toContain(heading)
    expect(await getResourceDetail(api, fixtures.name())).toBeNull()
    expect(await getOrdinaryItem(api, fixtures.name())).toBeNull()
    expect(publicRecordURL('resources', 'Русский / slug')).toBe(
      '/items/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9%20%2F%20slug',
    )
    expect(publicRecordURL('ordinary-items', 'test')).toBe('/ordinary-resources/test')
    expect(publicRecordURL('events', 'test')).toBe('/events/test')
    expect(publicRecordURL('clothing', 'test')).toBe('/clothing/test')
  })

  it('returns all three sources with quantities and every active use without duplicates', async () => {
    const item = await fixtures.create('resources', named())
    const expectedSources: string[] = []
    const expectedUses: string[] = []
    for (let index = 0; index < 12; index++) {
      for (const kind of ['events', 'quests', 'bosses'] as const) {
        const source = await fixtures.create(kind, {
          ...named(),
          coins: 0,
          cooldownMinutes: 0,
          rewards:
            kind === 'events'
              ? [{ resource: item.id, minQuantity: 0, maxQuantity: 3 }]
              : [{ resource: item.id, quantity: 2 }],
        } as never)
        expectedSources.push(`${kind}-${source.id}`)
      }
      for (const kind of ['resources', 'clothing', 'weapons'] as const) {
        const use = await fixtures.create(kind, {
          ...named(),
          craftable: true,
          recipe: { coins: 0, resourceIngredients: [{ resource: item.id, quantity: 1 }] },
        })
        expectedUses.push(`${kind}-${use.id}`)
      }
    }
    const inactive = await fixtures.create('weapons', {
      ...named(),
      craftable: false,
      recipe: { coins: 0, resourceIngredients: [{ resource: item.id, quantity: 1 }] },
    })
    const detail = (await getResourceDetail(api, item.slug, { pageSize: 2 }))!
    const sourceKeys = detail.sources.map(({ kind, id }) => `${kind}-${id}`)
    const useKeys = detail.uses.map(({ kind, id }) => `${kind}-${id}`)
    expect(sourceKeys.sort()).toEqual(expectedSources.sort())
    expect(useKeys.sort()).toEqual(expectedUses.sort())
    expect(new Set(sourceKeys).size).toBe(36)
    expect(new Set(useKeys).size).toBe(36)
    expect(useKeys).not.toContain(`weapons-${inactive.id}`)
    expect(
      detail.sources
        .filter(({ kind }) => kind === 'events')
        .every(({ minimum, maximum }) => minimum === 0 && maximum === 3),
    ).toBe(true)
    expect(
      detail.sources
        .filter(({ kind }) => kind !== 'events')
        .every(({ minimum, maximum }) => minimum === 2 && maximum === 2),
    ).toBe(true)
    const html = renderToStaticMarkup(createElement(ResourceDetails, { detail }))
    expect(html).toContain('href="/quests/')
  })

  it('resolves both ingredient kinds without loading nested recipes and hides inactive recipes from public APIs', async () => {
    const ingredient = await fixtures.create('resources', named())
    const plain = await fixtures.create('ordinary-items', named())
    const result = await fixtures.create('resources', {
      ...named(),
      craftable: true,
      recipe: {
        coins: 25,
        resourceIngredients: [{ resource: ingredient.id, quantity: 2 }],
        ordinaryIngredients: [{ item: plain.id, quantity: 4 }],
      },
    })
    const active = (await getResourceDetail(api, result.slug, { pageSize: 1 }))!
    expect(active.recipe).toMatchObject({
      coins: 25,
      ingredients: [
        { id: ingredient.id, quantity: 2, kind: 'resources' },
        { id: plain.id, quantity: 4, kind: 'ordinary-items' },
      ],
    })
    expect(active.recipe?.ingredients.every((item) => !('recipe' in item))).toBe(true)
    expect((await getOrdinaryItem(api, plain.slug))?.name).toBe(plain.name)
    const html = renderToStaticMarkup(createElement(ResourceDetails, { detail: active }))
    expect(html).toContain(publicRecordURL('resources', ingredient.slug))
    expect(html).toContain(publicRecordURL('ordinary-items', plain.slug))
    await api.update({
      collection: 'resources',
      id: result.id,
      data: { craftable: false },
      overrideAccess: true,
    })
    const publicDoc = await api.findByID({
      collection: 'resources',
      id: result.id,
      depth: 0,
      overrideAccess: false,
      user: null,
    })
    expect(publicDoc.recipe).toBeUndefined()
    expect((await getResourceDetail(api, result.slug))?.recipe).toBeNull()
    const account = await fixtures.create('users', {
      email: `${fixtures.name()}@example.test`,
      password: crypto.randomUUID(),
    })
    const adminDoc = await api.findByID({
      collection: 'resources',
      id: result.id,
      depth: 0,
      overrideAccess: false,
      user: { ...account, collection: 'users' },
    })
    expect(adminDoc.recipe?.resourceIngredients).toHaveLength(1)
  })

  it('keeps unmigrated legacy boss rewards visible as a single source', async () => {
    const item = await fixtures.create('resources', named())
    const other = await fixtures.create('resources', named())
    const boss = await fixtures.create('bosses', { ...named(), coins: 0 })
    await api.db.updateOne({
      collection: 'bosses',
      id: boss.id,
      data: { ...boss, goldenHeart: item.id, personalHeart: other.id, rewards: [] },
    })
    const detail = (await getResourceDetail(api, item.slug, { pageSize: 1 }))!
    expect(detail.sources).toEqual([
      { id: boss.id, name: boss.name, kind: 'bosses', slug: boss.slug, minimum: 1, maximum: 1 },
    ])
  })

  it.each([
    'resources',
    'ordinary-items',
    'events',
    'quests',
    'bosses',
    'clothing',
    'weapons',
    'equipment-sets',
  ] as const)(
    'permits public read but denies anonymous create/update/delete on %s',
    async (collection) => {
      const data = { ...named(), coins: 0, cooldownMinutes: 0 }
      const doc = await fixtures.create(collection, data as never)
      await expect(
        api.findByID({ collection, id: doc.id, overrideAccess: false, user: null, depth: 0 }),
      ).resolves.toMatchObject({ id: doc.id })
      await expect(
        api.create({ collection, data: data as never, overrideAccess: false, user: null }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        api.update({ collection, id: doc.id, data: {}, overrideAccess: false, user: null }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        api.delete({ collection, id: doc.id, overrideAccess: false, user: null }),
      ).rejects.toMatchObject({ status: 403 })
    },
  )

  it('keeps Users private and propagates query failures', async () => {
    for (const collection of ['users'] as const)
      await expect(
        api.find({ collection, overrideAccess: false, user: null }),
      ).rejects.toMatchObject({ status: 403 })
    const failure = new Error('Test read failure')
    vi.spyOn(api, 'find').mockRejectedValueOnce(failure)
    await expect(getResourceCatalog(api)).rejects.toBe(failure)
  })
  it('reads equipment with the shared recipe and set name, and returns null for unknown slugs', async () => {
    const ingredient = await fixtures.create('resources', named())
    const set = await fixtures.create('equipment-sets', named())
    for (const collection of ['clothing', 'weapons'] as const) {
      const item = await fixtures.create(collection, {
        ...named(),
        craftable: true,
        ...(collection === 'clothing' ? { equipmentSet: set.id } : {}),
        recipe: { coins: 7, resourceIngredients: [{ resource: ingredient.id, quantity: 2 }] },
      })
      const detail = (await getEquipmentDetail(api, collection, item.slug))!
      expect(detail.item.name).toBe(item.name)
      expect(detail.recipe?.ingredients[0]).toMatchObject({ id: ingredient.id, quantity: 2 })
      expect(detail.recipe?.coins).toBe(7)
      expect(detail.setName).toBe(collection === 'clothing' ? set.name : null)
      await api.update({
        collection,
        id: item.id,
        data: { craftable: false },
        overrideAccess: true,
      })
      expect((await getEquipmentDetail(api, collection, item.slug))?.recipe).toBeNull()
      expect(await getEquipmentDetail(api, collection, fixtures.name())).toBeNull()
    }
  })
  it('paginates ordered sets, hazmats, weapons and direct set membership without joins', async () => {
    const named = (index: number) => ({
      name: fixtures.name(),
      slug: fixtures.name(),
      _order: `a${String.fromCharCode(65 + index)}`,
    })
    const sets = [],
      hazmats = [],
      weapons = [],
      parts = []
    for (let index = 11; index >= 0; index--) {
      sets.push(await fixtures.create('equipment-sets', named(index)))
      hazmats.push(await fixtures.create('clothing', { ...named(index), equipmentSet: null }))
      weapons.push(await fixtures.create('weapons', named(index)))
    }
    const set = sets[0]
    for (let index = 11; index >= 0; index--)
      parts.push(await fixtures.create('clothing', { ...named(index), equipmentSet: set.id }))
    const where = { name: { contains: fixtures.prefix } }
    const spy = vi.spyOn(api, 'find')
    for (const [kind, expected] of [
      ['equipment-sets', sets],
      ['clothing', hazmats],
      ['weapons', weapons],
    ] as const) {
      const result = await getEquipmentCatalog(api, kind, { pageSize: 2, where })
      expect(result.map(({ id }) => id)).toEqual([...expected].reverse().map(({ id }) => id))
      expect(result.every((item) => !('recipe' in item))).toBe(true)
    }
    const detail = (await getSetDetail(api, set.slug, 2))!
    expect(detail.parts.map(({ id }) => id)).toEqual([...parts].reverse().map(({ id }) => id))
    expect(new Set(detail.parts.map(({ id }) => id)).size).toBe(12)
    expect(detail.item).not.toHaveProperty('recipe')
    expect(
      spy.mock.calls.every(([query]) => query.overrideAccess === false && query.depth === 0),
    ).toBe(true)
    expect(await getSetDetail(api, fixtures.name())).toBeNull()
    expect(await getEquipmentCatalog(api, 'weapons', { where: { id: { equals: -1 } } })).toEqual([])
  })
  it('returns every active craft result in collection and manual order without recipes or per-card reads', async () => {
    const ingredient = await fixtures.create('ordinary-items', named())
    const set = await fixtures.create('equipment-sets', named())
    const expected = []
    for (const kind of ['resources', 'clothing', 'weapons'] as const) {
      const group = []
      for (let index = 11; index >= 0; index--) {
        const doc = await fixtures.create(kind, {
          ...named(),
          _order: `a${String.fromCharCode(65 + index)}`,
          ...(kind === 'clothing' ? { equipmentSet: index % 2 ? set.id : null } : {}),
          craftable: true,
          recipe: { coins: 0, ordinaryIngredients: [{ item: ingredient.id, quantity: 1 }] },
        })
        group.push({ id: doc.id, kind })
      }
      expected.push(...group.reverse())
      await fixtures.create(kind, {
        ...named(),
        craftable: false,
        recipe: { coins: 0, ordinaryIngredients: [{ item: ingredient.id, quantity: 1 }] },
      })
    }
    const where = { name: { contains: fixtures.prefix } }
    const spy = vi.spyOn(api, 'find')
    const result = await getCraftCatalog(api, { pageSize: 2, where })
    expect(result.map(({ id, kind }) => ({ id, kind }))).toEqual(expected)
    expect(new Set(result.map(({ id, kind }) => `${kind}-${id}`)).size).toBe(36)
    expect(result.every((item) => item.image === null && !('recipe' in item))).toBe(true)
    expect(spy.mock.calls).toHaveLength(18)
    expect(
      spy.mock.calls.every(
        ([query]) =>
          query.overrideAccess === false &&
          query.depth === 0 &&
          query.select &&
          !('recipe' in query.select),
      ),
    ).toBe(true)
    spy.mockClear()
    await getCraftCatalog(api, { where })
    expect(spy.mock.calls).toHaveLength(3)
    expect(await getCraftCatalog(api, { where: { id: { equals: -1 } } })).toEqual([])
    spy.mockRejectedValueOnce(new Error('craft read failure'))
    await expect(getCraftCatalog(api, { where })).rejects.toThrow('craft read failure')
  })
  it('reads ordered bosses and batched array rewards across every page, with null only for missing slugs', async () => {
    const resources = []
    for (let index = 0; index < 12; index++)
      resources.push(await fixtures.create('resources', named()))
    const bosses: Boss[] = []
    for (let index = 11; index >= 0; index--)
      bosses.push(
        await fixtures.create('bosses', {
          ...named(),
          _order: `a${String.fromCharCode(65 + index)}`,
          coins: index,
          rewards: resources.map((resource, row) => ({ resource: resource.id, quantity: row + 1 })),
        }),
      )
    const spy = vi.spyOn(api, 'find')
    const catalog = await getBossCatalog(api, {
      pageSize: 2,
      where: { name: { contains: fixtures.prefix } },
    })
    expect(catalog.map(({ id }) => id)).toEqual([...bosses].reverse().map(({ id }) => id))
    expect(catalog[0].coins).toBe(0)
    expect(catalog[0].rewards).toEqual(
      resources.map((resource, row) => ({
        id: resource.id,
        name: resource.name,
        slug: resource.slug,
        quantity: row + 1,
      })),
    )
    expect(spy.mock.calls).toHaveLength(12)
    expect(
      spy.mock.calls.every(([query]) => query.overrideAccess === false && query.depth === 0),
    ).toBe(true)
    const detail = (await getBossDetail(api, bosses[0].slug))!
    expect(detail.coins).toBe(11)
    expect(detail.rewards).toHaveLength(12)
    expect(detail.item.image).toBeNull()
    const source = (await getResourceDetail(api, resources[0].slug))!.sources.find(
      (source) => source.id === bosses[0].id,
    )
    expect(source?.slug).toBe(bosses[0].slug)
    expect(await getBossDetail(api, fixtures.name())).toBeNull()
    expect(await getBossCatalog(api, { where: { id: { equals: -1 } } })).toEqual([])
    spy.mockRejectedValueOnce(new Error('boss read failure'))
    await expect(getBossCatalog(api)).rejects.toThrow('boss read failure')
  })
})

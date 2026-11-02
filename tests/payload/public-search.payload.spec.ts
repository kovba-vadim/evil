import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest'
import type { Payload } from 'payload'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { collidingRewards } from '../helpers/collidingRewards'
import { SEARCH_TYPES, parseSearchQuery } from '../../src/lib/search'
import { searchPublicCatalog } from '../../src/queries/public-search'
import { publicRecordURL } from '../../src/lib/public-record-url'
let api: Payload, fixtures: ModelFixtures
const named = () => ({ name: fixtures.name(), slug: fixtures.name() })
describe('public global search on isolated PostgreSQL', () => {
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
    vi.restoreAllMocks()
    await fixtures.cleanup()
  }, 60000)
  it('returns all eight types with canonical URLs and separate results for identical names and IDs', async () => {
    const query = fixtures.name()
    const pair = await collidingRewards(fixtures, fixtures.name())
    const docs = []
    for (const { kind } of SEARCH_TYPES) {
      if (kind === 'resources' || kind === 'ordinary-items') {
        const doc = kind === 'resources' ? pair.custom : pair.ordinary
        await api.update({
          collection: kind,
          id: doc.id,
          data: { name: query },
          overrideAccess: true,
        })
        docs.push({ kind, ...doc, name: query })
      } else
        docs.push({
          kind,
          ...(await fixtures.create(kind, {
            ...named(),
            name: query,
            coins: 0,
            cooldownMinutes: 0,
          })),
        })
    }
    expect(pair.custom.id).toBe(pair.ordinary.id)
    const spy = vi.spyOn(api, 'find')
    const result = await searchPublicCatalog(api, query.toUpperCase())
    expect(result.results.map((row) => row.kind)).toEqual(SEARCH_TYPES.map((type) => type.kind))
    expect(result.results).toHaveLength(8)
    expect(new Set(result.results.map((row) => row.key)).size).toBe(8)
    expect(result.more).toEqual([])
    for (const doc of docs)
      expect(result.results.find((row) => row.kind === doc.kind)).toMatchObject({
        id: doc.id,
        name: query,
        href: publicRecordURL(doc.kind, doc.slug),
      })
    expect(
      spy.mock.calls.every(
        ([options]) =>
          options.overrideAccess === false &&
          options.user === null &&
          options.depth === 0 &&
          options.limit! <= 100 &&
          Object.keys(options.select ?? {}).join(',') === 'name,slug',
      ),
    ).toBe(true)
    expect(result.results[0]).not.toHaveProperty('description')
    expect(result.results[0]).not.toHaveProperty('rewards')
  })
  it('ranks exact names before prefixes before substrings prior to the five-per-type cap', async () => {
    const query = fixtures.name(),
      expected = []
    for (const { kind } of SEARCH_TYPES) {
      const create = (name: string) =>
        fixtures.create(kind, { ...named(), name, coins: 0, cooldownMinutes: 0 })
      await create(`x ${query}`)
      const prefix = await create(`${query} tail`)
      for (let i = 0; i < 7; i++) await create(`y ${query} ${i}`)
      const exact = await create(query)
      expected.push({ kind, prefix, exact })
    }
    const result = await searchPublicCatalog(api, query, { pageSize: 2 })
    expect(result.results).toHaveLength(40)
    expect(result.results.slice(0, 8).map((row) => row.name)).toEqual(SEARCH_TYPES.map(() => query))
    expect(result.results.slice(8, 16).map((row) => row.name)).toEqual(
      SEARCH_TYPES.map(() => `${query} tail`),
    )
    expect(result.more.map((row) => row.kind)).toEqual(SEARCH_TYPES.map((row) => row.kind))
    for (const { kind, prefix, exact } of expected) {
      const matches = result.results.filter((row) => row.kind === kind)
      expect(matches).toHaveLength(5)
      expect(matches[0].id).toBe(exact.id)
      expect(matches[1].id).toBe(prefix.id)
    }
    expect(await searchPublicCatalog(api, query)).toEqual(result)
  })
  it('matches literal case-insensitive Cyrillic/English substrings, without searching other fields', async () => {
    const token = fixtures.name(),
      russian = await fixtures.create('resources', {
        ...named(),
        name: `Ледяной КРИСТАЛЛ ${token}`,
      })
    const english = await fixtures.create('weapons', {
      ...named(),
      name: `Ancient EVIL Sword ${token}`,
    })
    await fixtures.create('events', {
      ...named(),
      name: fixtures.name(),
      shortDescription: `КРИСТАЛЛ EVIL ${token}`,
      coins: 0,
      cooldownMinutes: 0,
    })
    expect(
      (await searchPublicCatalog(api, `кРиСтАлЛ ${token}`)).results.map((row) => row.id),
    ).toEqual([russian.id])
    expect(
      (await searchPublicCatalog(api, `eViL sWoRd ${token}`)).results.map((row) => row.id),
    ).toEqual([english.id])
    const literal = await fixtures.create('resources', {
      ...named(),
      name: `${token} 50% a_b a\\b`,
    })
    await fixtures.create('resources', { ...named(), name: `${token} 500 ab aab` })
    for (const suffix of ['50%', 'a_b', 'a\\b'])
      expect((await searchPublicCatalog(api, suffix)).results.map((row) => row.id)).toEqual([
        literal.id,
      ])
  })
  it('reports more only after a sixth literal match and propagates denied access', async () => {
    const query = fixtures.name()
    for (let index = 0; index < 5; index++)
      await fixtures.create('resources', { ...named(), name: `${query} ${index}` })
    expect((await searchPublicCatalog(api, query)).more).toEqual([])
    await fixtures.create('resources', { ...named(), name: `${query} sixth` })
    const result = await searchPublicCatalog(api, query)
    expect(result.results).toHaveLength(5)
    expect(result.more).toEqual([{ kind: 'resources', label: 'Кастомный предмет' }])
    vi.spyOn(api, 'find').mockRejectedValueOnce(Object.assign(new Error('Denied'), { status: 403 }))
    await expect(searchPublicCatalog(api, query)).rejects.toMatchObject({ status: 403 })
  })
  it('does not query for short terms and rejects invalid values before touching Payload', async () => {
    const spy = vi.spyOn(api, 'find')
    for (const query of ['', ' ', ' a ', '😀'])
      expect(await searchPublicCatalog(api, query)).toEqual({ results: [], more: [] })
    expect(spy).not.toHaveBeenCalled()
    for (const query of [null, [], {}, 42, 'x'.repeat(101), 'a\u0000b'])
      await expect(searchPublicCatalog(api, query)).rejects.toThrow()
    expect(spy).not.toHaveBeenCalled()
    expect(parseSearchQuery('  Evil  ')).toBe('Evil')
    expect(await searchPublicCatalog(api, fixtures.name())).toEqual({ results: [], more: [] })
    spy.mockRejectedValueOnce(new Error('search read failure'))
    await expect(searchPublicCatalog(api, 'long-enough')).rejects.toThrow('search read failure')
  })
})

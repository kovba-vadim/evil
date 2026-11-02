import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { OrdinaryItem } from '../../src/payload-types'
import { openTestPayload } from '../helpers/testDatabase'

// Opt in only with an explicitly isolated database. Never fall back to .env's URL.
const testURL = process.env.EVIL_TEST_DATABASE_URL
const resources: number[] = []
const bosses: number[] = []
const ordinary: number[] = []
let payload: Payload | undefined

describe.skipIf(!testURL)('boss reward migration through Payload on a dedicated database', () => {
  beforeAll(async () => {
    payload = await openTestPayload()
  }, 60000)

  afterAll(async () => {
    try {
      if (payload) {
        for (const id of bosses)
          await payload.delete({ collection: 'bosses', id, overrideAccess: true })
        for (const id of resources)
          await payload.delete({ collection: 'resources', id, overrideAccess: true })
        for (const id of ordinary)
          await payload.delete({ collection: 'ordinary-items', id, overrideAccess: true })
      }
    } finally {
      await payload?.destroy()
    }
  }, 60000)

  it('persists descriptions, validates arrays, preserves legacy rewards and guards deletion', async () => {
    const api = payload!
    const prefix = `boss-rewards-test-${crypto.randomUUID()}`
    const description: NonNullable<OrdinaryItem['description']> = {
      root: {
        type: 'root',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [
          {
            type: 'paragraph',
            version: 1,
            children: [
              {
                type: 'text',
                version: 1,
                text: 'Описание',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
              },
            ],
            direction: null,
            format: '',
            indent: 0,
          },
        ],
      },
    }
    const item = await api.create({
      collection: 'ordinary-items',
      data: { name: prefix, slug: prefix, description },
      overrideAccess: true,
    })
    ordinary.push(item.id)
    expect(
      (await api.findByID({ collection: 'ordinary-items', id: item.id, overrideAccess: true }))
        .description,
    ).toEqual(description)

    for (let index = 0; index < 3; index++) {
      const resource = await api.create({
        collection: 'resources',
        data: { name: `${prefix}-${index}`, slug: `${prefix}-${index}` },
        overrideAccess: true,
      })
      resources.push(resource.id)
    }
    const boss = await api.create({
      collection: 'bosses',
      data: {
        name: prefix,
        slug: prefix,
        coins: 0,
        rewards: resources.map((resource) => ({ resource, quantity: 1 })),
      },
      overrideAccess: true,
      depth: 0,
    })
    bosses.push(boss.id)
    expect(boss.rewards).toHaveLength(3)
    await expect(
      api.update({
        collection: 'bosses',
        id: boss.id,
        data: {
          rewards: [
            { resource: resources[0], quantity: 1 },
            { resource: resources[0], quantity: 2 },
          ],
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
    for (const quantity of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        api.update({
          collection: 'bosses',
          id: boss.id,
          data: { rewards: [{ resource: resources[0], quantity }] },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    }
    await expect(
      api.delete({ collection: 'resources', id: resources[0], overrideAccess: true }),
    ).rejects.toThrow()

    // Only fixture setup bypasses hooks to reproduce a document written by the old schema.
    await api.db.updateOne({
      collection: 'bosses',
      id: boss.id,
      // The PostgreSQL adapter upserts, so even fixture setup needs required columns.
      data: { ...boss, rewards: [], goldenHeart: resources[0], personalHeart: resources[1] },
    })
    const legacy = await api.findByID({
      collection: 'bosses',
      id: boss.id,
      depth: 0,
      select: { rewards: true },
      overrideAccess: true,
    })
    expect(legacy.rewards?.map(({ resource, quantity }) => ({ resource, quantity }))).toEqual([
      { resource: resources[0], quantity: 1 },
      { resource: resources[1], quantity: 1 },
    ])
    await expect(
      api.delete({ collection: 'resources', id: resources[1], overrideAccess: true }),
    ).rejects.toThrow()
    const migrated = await api.update({
      collection: 'bosses',
      id: boss.id,
      data: { name: `${prefix}-renamed` },
      depth: 0,
      overrideAccess: true,
    })
    expect(migrated.goldenHeart).toBeNull()
    expect(migrated.personalHeart).toBeNull()
    expect(migrated.rewards).toHaveLength(2)
    const repeated = await api.update({
      collection: 'bosses',
      id: boss.id,
      data: {},
      depth: 0,
      overrideAccess: true,
    })
    expect(repeated.rewards).toEqual(migrated.rewards)
    await api.update({
      collection: 'bosses',
      id: boss.id,
      data: { rewards: [] },
      overrideAccess: true,
    })
    expect(
      (await api.findByID({ collection: 'bosses', id: boss.id, overrideAccess: true })).rewards,
    ).toEqual([])
  }, 60000)
})

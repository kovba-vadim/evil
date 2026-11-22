import { expect, it } from 'vitest'
import { cooldownWriteCapability } from '../../src/access/player-cooldowns'
import {
  getPlayerQuestCooldowns,
  mutatePlayerQuestCooldown,
} from '../../src/queries/player-cooldowns'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'

it('keeps one independent quest cooldown per player and preserves fixed deadlines', async () => {
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  const playerIDs: number[] = []
  try {
    const makePlayer = async () => {
      const player = await fixtures.create('players', {
        nickname: 'Проверка',
        email: `${fixtures.name()}@example.test`,
        password: 'Quest-cooldown-test-password!',
        timeZone: 'Europe/London',
      })
      playerIDs.push(player.id)
      return { ...player, collection: 'players' as const }
    }
    const player = await makePlayer()
    const other = await makePlayer()
    const makeQuest = (cooldown: number) =>
      fixtures.create('quests', {
        name: fixtures.name(),
        slug: fixtures.name(),
        coins: 0,
        cooldown,
      })
    const once = await makeQuest(0)
    const slow = await makeQuest(30)
    const fast = await makeQuest(10)
    const complete = (previousRevision: string | null = null) => ({
      kind: 'complete' as const,
      requestID: crypto.randomUUID(),
      previousRevision,
    })
    await expect(mutatePlayerQuestCooldown(api, player, once.id, complete())).rejects.toThrow(
      'нет личного КД',
    )
    const parallel = await Promise.allSettled([
      mutatePlayerQuestCooldown(api, player, slow.id, complete()),
      mutatePlayerQuestCooldown(api, player, slow.id, complete()),
    ])
    expect(parallel.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(parallel.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const [first] = (await getPlayerQuestCooldowns(api, player, slow.id)).records
    expect(Date.parse(first.cooldownUntil) - Date.parse(first.completedAt)).toBe(30 * 60_000)
    expect((await getPlayerQuestCooldowns(api, other)).records).toEqual([])
    await expect(
      mutatePlayerQuestCooldown(api, other, slow.id, {
        kind: 'cancel',
        revision: first.revision,
      }),
    ).rejects.toThrow()
    const [second] = (await mutatePlayerQuestCooldown(api, other, slow.id, complete())).records
    expect(second.id).not.toBe(first.id)
    await expect(
      mutatePlayerQuestCooldown(api, other, slow.id, {
        kind: 'cancel',
        revision: first.revision,
      }),
    ).rejects.toThrow()
    await expect(
      api.update({
        collection: 'player-quest-cooldowns',
        id: first.id,
        data: { cancelled: true },
        user: player,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    const request = complete()
    await mutatePlayerQuestCooldown(api, player, fast.id, request)
    const retried = await mutatePlayerQuestCooldown(api, player, fast.id, request)
    expect((await getPlayerQuestCooldowns(api, player)).records.map((row) => row.questID)).toEqual([
      fast.id,
      slow.id,
    ])
    await api.update({
      collection: 'quests',
      id: slow.id,
      data: { cooldown: 45 },
      overrideAccess: true,
    })
    expect((await getPlayerQuestCooldowns(api, player, slow.id)).records[0]).toEqual(first)
    await mutatePlayerQuestCooldown(api, player, fast.id, {
      kind: 'cancel',
      revision: retried.records[0].revision,
    })
    expect((await getPlayerQuestCooldowns(api, player)).records.map((row) => row.questID)).toEqual([
      slow.id,
    ])
    await api.db.updateOne({
      collection: 'player-quest-cooldowns',
      id: first.id,
      data: {
        cooldownUntil: '2020-01-01T00:00:00.000Z',
      },
    })
    expect((await getPlayerQuestCooldowns(api, player)).records).toEqual([])
    const [updated] = (
      await mutatePlayerQuestCooldown(api, player, slow.id, complete(first.revision))
    ).records
    expect(updated.id).toBe(first.id)
    expect(Date.parse(updated.cooldownUntil) - Date.parse(updated.completedAt)).toBe(45 * 60_000)
  } finally {
    if (playerIDs.length)
      await api.delete({
        collection: 'player-quest-cooldowns',
        where: { player: { in: playerIDs } },
        context: { cooldownWrite: cooldownWriteCapability },
        overrideAccess: true,
      })
    await fixtures.cleanup()
    await api.destroy()
  }
})

import { expect, test } from '@playwright/test'
import { cooldownWriteCapability } from '../../src/access/player-cooldowns'
import { ModelFixtures } from '../helpers/modelFixtures'
import { openTestPayload } from '../helpers/testDatabase'

test('quest completion, expiry and cancellation share the account view', async ({ page }) => {
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  let playerID: number | undefined
  try {
    const password = 'Quest-cooldown-browser-password!'
    const player = await fixtures.create('players', {
      nickname: 'Квесты',
      email: `${fixtures.name()}@example.test`,
      password,
      timeZone: 'server',
    })
    playerID = player.id
    const makeQuest = (cooldown: number) =>
      fixtures.create('quests', {
        name: fixtures.name(),
        slug: fixtures.name(),
        coins: 0,
        cooldown,
      })
    const once = await makeQuest(0)
    const fast = await makeQuest(1)
    const slow = await makeQuest(30)
    await page.setViewportSize({ width: 320, height: 780 })
    const complete = page.getByRole('button', { name: 'Сдал', exact: true })
    await page.goto(`/quests/${once.slug}`)
    await expect(complete).toHaveCount(0)
    await expect(page.getByText('КД прохождения: Без КД')).toBeVisible()
    await page.goto(`/quests/${slow.slug}`)
    await complete.press('Enter')
    const guest = page.getByRole('dialog', { name: 'Личный КД квеста' })
    await guest.getByRole('link', { name: 'войдите', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill(player.email)
    await page.getByLabel('Пароль', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(page).toHaveURL(`/quests/${slow.slug}`, { timeout: 20_000 })
    await expect(complete).toBeVisible()
    const rejected = await page.request.post('/api/account/cooldowns', {
      headers: { Origin: 'http://localhost:3101', 'X-Cooldown-Player': String(player.id) },
      data: {
        action: 'complete',
        questID: once.id,
        requestID: crypto.randomUUID(),
        previousRevision: null,
      },
    })
    expect(rejected.status()).toBe(409)
    await complete.click()
    const panel = page.getByRole('region', { name: 'Мой КД квеста' })
    await expect(panel.getByText(/Осталось:/)).toBeVisible()
    await expect(complete).toHaveCount(0)
    const deadline = await panel.locator('time').getAttribute('datetime')
    await page.reload()
    await expect(panel.locator('time')).toHaveAttribute('datetime', deadline!)

    await page.goto(`/quests/${fast.slug}`)
    await complete.click()
    await expect(panel.getByText(/Осталось:/)).toBeVisible()
    expect((await page.request.get('/account/cooldowns')).ok()).toBe(true)
    const fastRecord = await api.find({
      collection: 'player-quest-cooldowns',
      where: { and: [{ player: { equals: player.id } }, { quest: { equals: fast.id } }] },
      overrideAccess: true,
    })
    await api.db.updateOne({
      collection: 'player-quest-cooldowns',
      id: fastRecord.docs[0].id,
      data: { cooldownUntil: new Date(Date.now() + 8_000).toISOString() },
    })
    await page.goto('/account/cooldowns')
    const questList = page.getByRole('region', { name: 'КД квестов', exact: true })
    const eventList = page.getByRole('region', { name: 'КД ивентов', exact: true })
    await expect(eventList.getByText('Активных личных КД нет.')).toBeVisible()
    await expect(questList.getByRole('link')).toHaveText([fast.name, slow.name])
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await expect(questList.getByRole('link')).toHaveText([slow.name], { timeout: 15_000 })
    const cancel = questList.getByRole('button', { name: 'Отменить отметку' })
    await cancel.click()
    const confirm = page.getByRole('alertdialog', { name: 'Отменить сдачу?' })
    await expect(confirm).toContainText(slow.name)
    await page.keyboard.press('Escape')
    await expect(cancel).toBeFocused()
    await expect(questList.getByRole('link')).toHaveText([slow.name])
    await cancel.click()
    await confirm.getByRole('button', { name: 'Да, отменить' }).click()
    await expect(questList.getByText('Активных КД квестов нет.')).toBeVisible()
    await page.goto(`/quests/${slow.slug}`)
    await expect(complete).toBeVisible()
  } finally {
    if (playerID !== undefined)
      await api.delete({
        collection: 'player-quest-cooldowns',
        where: { player: { equals: playerID } },
        context: { cooldownWrite: cooldownWriteCapability },
        overrideAccess: true,
      })
    await fixtures.cleanup()
    await api.destroy()
  }
})

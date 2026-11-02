import { expect, test } from '@playwright/test'
import type { Quest } from '../../src/payload-types'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { collidingRewards } from '../helpers/collidingRewards'
import { publicRecordURL } from '../../src/lib/public-record-url'
test('quests category, typed ALL rewards, live filters and canonical pages', async ({
  page,
  request,
}) => {
  const api = await openTestPayload(),
    fixtures = new ModelFixtures(api)
  const named = () => ({ name: fixtures.name(), slug: fixtures.name() })
  try {
    await page.goto('/quests')
    await expect(page.getByText('Квесты пока не добавлены.')).toBeVisible()
    const { custom, ordinary } = await collidingRewards(fixtures, fixtures.name())
    expect(custom.id).toBe(ordinary.id)
    const customB = await fixtures.create('resources', named()),
      ordinaryB = await fixtures.create('ordinary-items', named())
    const category = await fixtures.create('quest-categories', named())
    const quests: Quest[] = []
    for (let i = 11; i >= 0; i--)
      quests.push(
        await fixtures.create('quests', {
          ...named(),
          _order: `a${String.fromCharCode(65 + i)}`,
          coins: i,
          category: i % 2 === 0 ? category.id : null,
          requiredQuantity: i === 0 ? null : 5,
          cooldown: i === 0 ? '' : 'Раз в сутки',
          description: {
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
                      text: 'Описание квеста Lexical',
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                    },
                  ],
                },
              ],
            },
          },
          rewards: [
            { resource: custom.id, quantity: 2 },
            ...(i % 2 === 0 ? [{ resource: customB.id, quantity: 3 }] : []),
          ],
          ordinaryRewards:
            i % 3 === 0
              ? [
                  { item: ordinary.id, quantity: 4 },
                  { item: ordinaryB.id, quantity: 5 },
                ]
              : [],
        }),
      )
    const empty = await fixtures.create('quests', { ...named(), coins: 0, category: null })
    await page.goto('/quests')
    await expect(page.getByText('Найдено: 13', { exact: true })).toBeVisible()
    const names = await page.locator('#main-content a[href^="/quests/"]').allTextContents()
    expect(names.filter((name) => name !== empty.name)).toEqual(
      [...quests].reverse().map((q) => q.name),
    )
    const from = page.getByRole('spinbutton', { name: 'Монеты От', exact: true }),
      to = page.getByRole('spinbutton', { name: 'Монеты До', exact: true })
    const select = page.getByRole('combobox', { name: 'Категория', exact: true })
    await select.selectOption(String(category.id))
    await expect(page.getByText('Найдено: 6', { exact: true })).toBeVisible()
    await from.fill('2')
    await to.fill('8')
    await expect(page.getByText('Найдено: 4', { exact: true })).toBeVisible()
    const customChoice = page.getByRole('checkbox', {
      name: `Кастомный предмет: ${custom.name}`,
      exact: true,
    })
    const ordinaryChoice = page.getByRole('checkbox', {
      name: `Обычный ресурс: ${ordinary.name}`,
      exact: true,
    })
    await customChoice.check()
    await ordinaryChoice.check()
    await expect(page.getByText('Найдено: 1', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('link', { name: quests.find((q) => q.coins === 6)!.name, exact: true }),
    ).toBeVisible()
    await page
      .getByRole('checkbox', { name: `Кастомный предмет: ${customB.name}`, exact: true })
      .check()
    await page
      .getByRole('checkbox', { name: `Обычный ресурс: ${ordinaryB.name}`, exact: true })
      .check()
    await expect(page.getByText('Найдено: 1', { exact: true })).toBeVisible()
    await expect(from).toHaveAttribute('min', '0')
    await expect(to).toHaveAttribute('max', '11')
    await from.fill('3')
    await to.fill('3')
    await expect(page.getByText('Квесты по выбранным условиям не найдены.')).toBeVisible()
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await expect(page.getByText('Найдено: 13', { exact: true })).toBeVisible()
    await expect(select).toHaveValue('')
    await from.fill('0')
    await to.fill('0')
    await expect(page.getByText('Найдено: 2', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    let queries = 0
    page.on('request', (req) => {
      if (req.url().endsWith('/api/public/quests')) queries++
    })
    await from.fill('1')
    await from.fill('2')
    await from.fill('3')
    await expect(page.getByText('Найдено: 9', { exact: true })).toBeVisible()
    expect(queries).toBe(1)
    await page.route('**/api/public/quests', async (route) => {
      const response = await route.fetch()
      if (route.request().postDataJSON().coinsFrom === 4)
        await new Promise((resolve) => setTimeout(resolve, 700))
      await route.fulfill({ response }).catch(() => {})
    })
    const started = page.waitForRequest(
      (req) => req.url().endsWith('/api/public/quests') && req.postDataJSON().coinsFrom === 4,
    )
    await from.fill('4')
    await started
    await from.fill('8')
    await expect(page.getByText('Найдено: 4', { exact: true })).toBeVisible()
    await page.waitForTimeout(800)
    await expect(page.getByText('Найдено: 4', { exact: true })).toBeVisible()
    await page.unroute('**/api/public/quests')
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    const lower = page.getByRole('slider', { name: 'Монеты от', exact: true })
    await lower.focus()
    await lower.press('ArrowRight')
    await expect(from).toHaveValue('1')
    await expect(page.getByText('Найдено: 11', { exact: true })).toBeVisible()
    const quest = quests.find((q) => q.coins === 6)!
    for (const mobile of [false, true]) {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      )
      await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
      await page.goto('/quests')
      await expect(page.locator('html')).toHaveClass(mobile ? /dark/ : /light/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: `test-results/quests-${mobile ? 'mobile-dark' : 'desktop-light'}.png`,
      })
      await page.goto(publicRecordURL('resources', custom.slug)!)
      await page
        .getByRole('region', { name: 'Где получить' })
        .getByRole('link', { name: quest.name, exact: true })
        .click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(quest.name)
      await expect(page.getByText('Описание квеста Lexical', { exact: true })).toBeVisible()
      await expect(page.getByText('Необходимое количество: 5', { exact: true })).toBeVisible()
      await expect(page.getByText('КД прохождения: Раз в сутки', { exact: true })).toBeVisible()
      const rewards = page.getByRole('region', { name: 'Возможные награды' })
      await expect(rewards.getByRole('link')).toHaveCount(4)
      await expect(rewards).toContainText('Количество: 4')
      await rewards.locator(`a[href="${publicRecordURL('resources', custom.slug)}"]`).click()
      await expect(page).toHaveURL(publicRecordURL('resources', custom.slug)!)
      await page.goto(publicRecordURL('quests', quest.slug)!)
      await page.locator(`a[href="${publicRecordURL('ordinary-items', ordinary.slug)}"]`).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(ordinary.name)
    }
    await page.goto(publicRecordURL('quests', empty.slug)!)
    await expect(page.locator('#main-content')).not.toContainText('Категория:')
    await expect(page.locator('#main-content')).not.toContainText('Необходимое количество:')
    await expect(page.locator('#main-content')).not.toContainText('КД прохождения:')
    expect((await page.goto(`/quests/${fixtures.name()}`))?.status()).toBe(404)
    expect(
      (
        await request.post('/api/public/quests', {
          data: { rewards: [{ kind: 'weapons', id: 1 }] },
        })
      ).status(),
    ).toBe(400)
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

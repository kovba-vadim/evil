import { expect, test } from '@playwright/test'
import type { Quest } from '../../src/payload-types'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { collidingRewards } from '../helpers/collidingRewards'
import { publicRecordURL } from '../../src/lib/public-record-url'

test('quest admin displays cooldown as an optional number of minutes', async ({ page }) => {
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  try {
    const password = crypto.randomUUID()
    const user = await fixtures.create('users', {
      email: `${fixtures.name()}@example.test`,
      password,
    })
    const login = await page.request.post('/api/users/login', {
      data: { email: user.email, password },
    })
    expect(login.ok()).toBe(true)
    await page.goto('/admin/collections/quests/create')
    const cooldown = page.getByRole('spinbutton', { name: 'КД прохождения (минуты)' })
    await expect(cooldown).toHaveAttribute('type', 'number')
    await expect(cooldown).toHaveValue('0')
    await expect(cooldown).not.toHaveAttribute('required')
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

test('quests category, typed ALL rewards, filter dialog and canonical pages', async ({
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
    const category = await fixtures.create('quest-categories', {
      name: 'А' + 'Длинноеназваниекатегории'.repeat(4),
      slug: fixtures.name(),
      _order: 'aB',
    })
    const secondCategory = await fixtures.create('quest-categories', {
      name: 'Я' + 'Другаякатегория'.repeat(4),
      slug: fixtures.name(),
      _order: 'aA',
    })
    const emptyCategory = await fixtures.create('quest-categories', named())
    const quests: Quest[] = []
    for (let i = 11; i >= 0; i--)
      quests.push(
        await fixtures.create('quests', {
          ...named(),
          _order: `a${String.fromCharCode(65 + i)}`,
          coins: i,
          category: i % 2 === 0 ? category.id : i === 1 ? secondCategory.id : null,
          requiredQuantity: i === 0 ? null : 5,
          cooldown: i === 0 ? 0 : 1440,
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
    const allTab = page.getByRole('tab', { name: 'Все', exact: true })
    const categoryTab = page.getByRole('tab', { name: category.name, exact: true })
    const secondTab = page.getByRole('tab', { name: secondCategory.name, exact: true })
    await expect(allTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab')).toHaveText(['Все', secondCategory.name, category.name])
    await expect(page.getByRole('tab', { name: emptyCategory.name, exact: true })).toHaveCount(0)
    for (const width of [320, 375, 425, 768]) {
      await page.setViewportSize({ width, height: 800 })
      await expect(page.locator('[data-slot="sidebar-gap"]')).toHaveCSS('width', '48px')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
      if (width === 320)
        expect((await categoryTab.boundingBox())!.y).toBeGreaterThan(
          (await allTab.boundingBox())!.y,
        )
    }
    const names = await page.locator('#main-content a[href^="/quests/"]').allTextContents()
    expect(names.filter((name) => name !== empty.name)).toEqual(
      [...quests].reverse().map((q) => q.name),
    )
    const trigger = page.getByRole('button', { name: /^Фильтры/ })
    const quickReset = page.getByRole('main').getByRole('button', { name: 'Сбросить', exact: true })
    const dialog = page.getByRole('dialog', { name: 'Фильтры квестов' })
    const apply = dialog.getByRole('button', { name: 'Показать результаты' })
    const reset = dialog.getByRole('button', { name: 'Сбросить', exact: true })
    await expect(dialog).toHaveCount(0)
    await expect(quickReset).toHaveCount(0)
    await expect(page.getByRole('spinbutton')).toHaveCount(0)
    await trigger.click()
    const from = page.getByRole('spinbutton', { name: 'Монеты От', exact: true }),
      to = page.getByRole('spinbutton', { name: 'Монеты До', exact: true })
    const select = page.getByRole('combobox', { name: 'Категория', exact: true })
    await select.selectOption(String(category.id))
    await expect(page).toHaveURL('/quests')
    await expect(page.getByText('Найдено: 13', { exact: true })).toBeVisible()
    await apply.click()
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toHaveText('Фильтры (1)')
    await expect(quickReset).toBeVisible()
    await expect(page.getByText('Найдено: 6', { exact: true })).toBeVisible()
    await expect(categoryTab).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(`/quests?tab=${category.id}`)
    await expect(page.locator('#main-content a[href^="/quests/"]')).toHaveText(
      [...quests]
        .reverse()
        .filter((quest) => quest.coins % 2 === 0)
        .map((quest) => quest.name),
    )
    await trigger.click()
    await expect(select).toHaveValue(String(category.id))
    await from.fill('9')
    await to.fill('8')
    await expect(apply).toBeDisabled()
    await from.fill('2')
    await apply.click()
    await expect(trigger).toHaveText('Фильтры (2)')
    await expect(page.getByText('Найдено: 4', { exact: true })).toBeVisible()
    await allTab.click()
    await expect(trigger).toHaveText('Фильтры (1)')
    await expect(page.getByText('Найдено: 7', { exact: true })).toBeVisible()
    await secondTab.click()
    await expect(page.getByText('Квесты по выбранным условиям не найдены.')).toBeVisible()
    await categoryTab.click()
    await expect(page.getByText('Найдено: 4', { exact: true })).toBeVisible()
    const customChoice = page.getByRole('checkbox', {
      name: `Кастомный предмет: ${custom.name}`,
      exact: true,
    })
    const ordinaryChoice = page.getByRole('checkbox', {
      name: `Обычный ресурс: ${ordinary.name}`,
      exact: true,
    })
    await trigger.click()
    await customChoice.check()
    await ordinaryChoice.check()
    await apply.click()
    await expect(trigger).toHaveText('Фильтры (3)')
    await expect(page.getByText('Найдено: 1', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('link', { name: quests.find((q) => q.coins === 6)!.name, exact: true }),
    ).toBeVisible()
    await trigger.click()
    await page
      .getByRole('checkbox', { name: `Кастомный предмет: ${customB.name}`, exact: true })
      .check()
    await page
      .getByRole('checkbox', { name: `Обычный ресурс: ${ordinaryB.name}`, exact: true })
      .check()
    await apply.click()
    await expect(page.getByText('Найдено: 1', { exact: true })).toBeVisible()
    await expect(trigger).toHaveText('Фильтры (3)')
    for (const dismiss of [
      () => page.keyboard.press('Escape'),
      () => dialog.getByRole('button', { name: 'Закрыть фильтры' }).click(),
      () => page.mouse.click(2, 2),
    ]) {
      await trigger.click()
      await expect(select).toHaveValue(String(category.id))
      await expect(customChoice).toBeChecked()
      await reset.click()
      await expect(select).toHaveValue('')
      await expect(customChoice).not.toBeChecked()
      await dismiss()
      await expect(dialog).toHaveCount(0)
      await expect(trigger).toHaveText('Фильтры (3)')
      await expect(page.getByText('Найдено: 1', { exact: true })).toBeVisible()
    }
    await trigger.click()
    await expect(from).toHaveAttribute('min', '0')
    await expect(to).toHaveAttribute('max', '11')
    await from.fill('3')
    await to.fill('3')
    await apply.click()
    await expect(page.getByText('Квесты по выбранным условиям не найдены.')).toBeVisible()
    await expect(quickReset).toBeVisible()
    await quickReset.click()
    await expect(allTab).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL('/quests')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toHaveText('Фильтры')
    await expect(quickReset).toHaveCount(0)
    await expect(page.getByText('Найдено: 13', { exact: true })).toBeVisible()
    await trigger.click()
    await expect(select).toHaveValue('')
    await expect(from).toHaveValue('0')
    await expect(to).toHaveValue('11')
    await expect(customChoice).not.toBeChecked()
    await expect(ordinaryChoice).not.toBeChecked()
    await from.fill('0')
    await to.fill('0')
    await apply.click()
    await expect(page.getByText('Найдено: 2', { exact: true })).toBeVisible()
    await trigger.click()
    await reset.click()
    let queries = 0
    page.on('request', (req) => {
      if (req.url().endsWith('/api/public/quests')) queries++
    })
    await from.fill('1')
    await from.fill('2')
    await from.fill('3')
    expect(queries).toBe(0)
    await apply.click()
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
    await trigger.click()
    await from.fill('4')
    await apply.click()
    await started
    await trigger.click()
    await from.fill('8')
    await apply.click()
    await expect(page.getByText('Найдено: 4', { exact: true })).toBeVisible()
    await page.waitForTimeout(800)
    await expect(page.getByText('Найдено: 4', { exact: true })).toBeVisible()
    await page.unroute('**/api/public/quests')
    await trigger.click()
    await reset.click()
    const lower = page.getByRole('slider', { name: 'Монеты от', exact: true })
    await lower.focus()
    await lower.press('ArrowRight')
    await expect(from).toHaveValue('1')
    await apply.click()
    await expect(page.getByText('Найдено: 11', { exact: true })).toBeVisible()
    const quest = quests.find((q) => q.coins === 6)!
    for (const mobile of [false, true]) {
      await page.setViewportSize(
        mobile ? { width: 320, height: 480 } : { width: 1280, height: 900 },
      )
      await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
      await page.goto('/quests')
      await expect(page.locator('html')).toHaveClass(mobile ? /dark/ : /light/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await trigger.click()
      const footer = await apply.boundingBox()
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
      if (mobile) {
        const body = dialog.locator('.overflow-y-auto').first()
        await body.evaluate((element) => {
          element.scrollTop = element.scrollHeight
        })
        expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      }
      await page.screenshot({
        path: `test-results/quests-${mobile ? 'mobile-dark' : 'desktop-light'}.png`,
      })
      await select.selectOption(String(category.id))
      await apply.click()
      await expect(page.getByText('Найдено: 6', { exact: true })).toBeVisible()
      await expect(quickReset).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await quickReset.click()
      await expect(page.getByText('Найдено: 13', { exact: true })).toBeVisible()
      await page.goto(publicRecordURL('resources', custom.slug)!)
      await page
        .getByRole('region', { name: 'Где получить' })
        .getByRole('link', { name: quest.name, exact: true })
        .click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(quest.name)
      await expect(page.getByText('Описание квеста Lexical', { exact: true })).toBeVisible()
      await expect(page.getByText('Необходимое количество: 5', { exact: true })).toBeVisible()
      await expect(page.getByText('КД прохождения: 1 д.', { exact: true })).toBeVisible()
      const rewards = page.getByRole('region', { name: 'Возможные награды' })
      await expect(rewards.getByRole('link')).toHaveCount(4)
      await expect(rewards).toContainText('Количество: 4')
      await rewards.locator(`a[href="${publicRecordURL('resources', custom.slug)}"]`).click()
      await expect(page).toHaveURL(`${publicRecordURL('resources', custom.slug)}`)
      await page.goto(publicRecordURL('quests', quest.slug)!)
      await page.locator(`a[href="${publicRecordURL('ordinary-items', ordinary.slug)}"]`).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(ordinary.name)
    }
    const renamed = 'Переименованная категория'
    await api.update({
      collection: 'quest-categories',
      id: category.id,
      data: { name: renamed },
      overrideAccess: true,
    })
    await page.goto(`/quests?tab=${category.id}&source=test`)
    await expect(page.getByRole('tab', { name: renamed, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByText('Найдено: 6', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: quest.name, exact: true }).click()
    await expect(page).toHaveURL(publicRecordURL('quests', quest.slug)!)
    await page.goBack()
    await expect(page.getByRole('tab', { name: renamed, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await allTab.click()
    await expect(page).toHaveURL('/quests?source=test')
    await fixtures.create('quests', { ...named(), coins: 0, category: emptyCategory.id })
    await page.goto('/quests?tab=unknown')
    await expect(allTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: emptyCategory.name, exact: true })).toBeVisible()
    await page.goto(publicRecordURL('quests', empty.slug)!)
    await expect(page.locator('#main-content')).not.toContainText('Категория:')
    await expect(page.locator('#main-content')).not.toContainText('Необходимое количество:')
    await expect(page.locator('#main-content')).toContainText('КД прохождения: Без КД')
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

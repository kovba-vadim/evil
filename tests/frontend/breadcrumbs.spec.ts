import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'

test('breadcrumbs use fixed parents and back restores only confirmed internal history', async ({
  page,
}) => {
  test.setTimeout(60000)
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  const named = () => {
    const name = fixtures.name()
    return { name, slug: name }
  }
  try {
    const wood = await fixtures.create('resources', named())
    const heart = await fixtures.create('resources', {
      ...named(),
      craftable: true,
      recipe: { coins: 0, resourceIngredients: [{ resource: wood.id, quantity: 1 }] },
    })
    const plain = await fixtures.create('ordinary-items', named())
    const set = await fixtures.create('equipment-sets', named())
    const clothing = await fixtures.create('clothing', {
      ...named(),
      category: 'set',
      equipmentSet: set.id,
      craftable: true,
      recipe: { coins: 0, resourceIngredients: [{ resource: heart.id, quantity: 1 }] },
    })
    const ring = await fixtures.create('clothing', { ...named(), category: 'ring' })
    const weapon = await fixtures.create('weapons', named())
    const boss = await fixtures.create('bosses', { ...named(), coins: 0 })
    const quest = await fixtures.create('quests', { ...named(), coins: 0 })
    const event = await fixtures.create('events', {
      ...named(),
      coins: 0,
      cooldownMinutes: 0,
      durationMinutes: 30,
      rewards: [{ resource: heart.id, minQuantity: 1, maxQuantity: 1 }],
    })
    const crumbs = page.getByRole('navigation', { name: 'Хлебные крошки' })
    for (const [path, record, label, root] of [
      ['items', heart, 'Кастомные предметы', '/items'],
      ['ordinary-resources', plain, 'Craft', '/craft'],
      ['clothing', clothing, 'Одежда', '/clothing'],
      ['clothing/sets', set, 'Одежда', '/clothing'],
      ['weapons', weapon, 'Оружие', '/weapons'],
      ['bosses', boss, 'Ивент-боссы', '/bosses'],
      ['quests', quest, 'Квесты', '/quests'],
      ['events', event, 'Ивенты', '/events'],
    ] as const) {
      await page.goto(`/${path}/${record.slug}`)
      await expect(crumbs.getByRole('link', { name: label, exact: true })).toHaveAttribute(
        'href',
        root,
      )
      await expect(crumbs.locator('[aria-current="page"]')).toHaveText(record.name)
      await expect(crumbs.locator('a')).toHaveCount(1)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `/${path}/${record.slug}`,
      )
    }
    const back = page.getByRole('button', { name: 'Назад', exact: true })
    for (const root of ['craft', 'items']) {
      await page.goto(`/${root}?from=events`)
      await expect(crumbs).toHaveCount(0)
      await page.getByRole('link', { name: heart.name, exact: true }).click()
      await expect(page).toHaveURL(`/items/${heart.slug}`)
      await expect(crumbs.locator('a')).toHaveText('Кастомные предметы')
      await page
        .getByRole('region', { name: 'Как скрафтить' })
        .getByRole('link', { name: wood.name })
        .click()
      await expect(page).toHaveURL(`/items/${wood.slug}`)
      await back.click()
      await expect(page).toHaveURL(`/items/${heart.slug}`)
      await back.click()
      await expect(page).toHaveURL(`/${root}?from=events`)
    }
    await page.goto(`/items/${heart.slug}?from=craft`)
    await expect(crumbs.locator('a')).toHaveAttribute('href', '/items')
    await back.click()
    await expect(page).toHaveURL('/items')
    await page.goto('/craft')
    await page.getByRole('link', { name: heart.name, exact: true }).click()
    await expect(page).toHaveURL(`/items/${heart.slug}`)
    await page.reload()
    await back.click()
    await expect(page).toHaveURL('/items')

    await page.goto('/clothing')
    await page.getByRole('tab', { name: 'Кольца' }).click()
    await page.getByRole('link', { name: ring.name, exact: true }).click()
    await back.click()
    await expect(page).toHaveURL('/clothing?tab=rings')
    await expect(page.getByRole('tab', { name: 'Кольца' })).toHaveAttribute('aria-selected', 'true')

    await page.goto('/clothing')
    await page.getByRole('link', { name: set.name, exact: true }).click()
    await expect(page).toHaveURL(`/clothing/sets/${set.slug}`)
    await page
      .getByRole('region', { name: 'Всего для крафта сета' })
      .getByRole('link', { name: heart.name })
      .click()
    await expect(crumbs.locator('a')).toHaveAttribute('href', '/items')
    await back.click()
    await expect(page).toHaveURL(`/clothing/sets/${set.slug}`)
    await back.click()
    await expect(page).toHaveURL('/clothing')

    await page.goto('/events')
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox').fill(heart.name)
    await page.getByRole('option', { name: new RegExp(heart.name) }).click()
    await expect(crumbs.locator('a')).toHaveAttribute('href', '/items')
    await back.click()
    await expect(page).toHaveURL('/events')

    await page.route('https://external.example/', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<a href="http://localhost:3100/items/${heart.slug}">Открыть предмет</a>`,
      }),
    )
    await page.goto('https://external.example/')
    await page.getByRole('link').click()
    await expect(page).toHaveURL(`/items/${heart.slug}`)
    await back.click()
    await expect(page).toHaveURL('/items')
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width: 320, height: 800 })
      await page.emulateMedia({ colorScheme: theme })
      await page.goto(`/items/${heart.slug}?from=craft`)
      await expect(crumbs).toBeVisible()
      // Exercise wrapping without writing artificial content to the database.
      await crumbs.locator('[aria-current="page"]').evaluate((el) => {
        el.textContent = 'ДлинноеНазваниеПредмета'.repeat(12)
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      const parent = crumbs.locator('a')
      await parent.focus()
      await expect(parent).toBeFocused()
      await page.screenshot({
        path: `test-results/breadcrumbs-mobile-${theme}.png`,
        fullPage: true,
      })
    }
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

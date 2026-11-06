import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { publicRecordURL } from '../../src/lib/public-record-url'

test('equipment catalogs, complete sets, navigation and empty states across themes and viewports', async ({
  page,
}) => {
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  const named = (index: number) => ({
    name: fixtures.name(),
    slug: fixtures.name(),
    _order: `a${String.fromCharCode(65 + index)}`,
  })
  try {
    await page.goto('/clothing')
    await expect(page.getByText('Сеты пока не добавлены.')).toBeVisible()
    await expect(page.getByText('Хазматы пока не добавлены.')).toBeVisible()
    await page.goto('/weapons')
    await expect(page.getByText('Оружие пока не добавлено.')).toBeVisible()
    const set = await fixtures.create('equipment-sets', named(0))
    const empty = await fixtures.create('equipment-sets', named(1))
    const hazmat = await fixtures.create('clothing', { ...named(0), equipmentSet: null })
    const resource = await fixtures.create('resources', named(0))
    const parts = [],
      weapons = []
    for (let index = 11; index >= 0; index--) {
      parts.push(
        await fixtures.create('clothing', {
          ...named(index),
          equipmentSet: set.id,
          craftable: true,
          recipe: {
            resourceIngredients: [{ resource: resource.id, quantity: index + 1 }],
            coins: index,
          },
        }),
      )
      weapons.push(await fixtures.create('weapons', named(index)))
    }
    for (const mobile of [false, true]) {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      )
      await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
      await page.goto('/clothing')
      await expect(
        page.getByRole('region', { name: 'Сеты', exact: true }).getByRole('link'),
      ).toHaveText([set.name, empty.name])
      const hazmats = page.getByRole('region', { name: 'Хазматы' })
      await expect(hazmats.getByRole('link')).toHaveText([hazmat.name])
      await page.getByRole('link', { name: set.name, exact: true }).click()
      await expect(page).toHaveURL(publicRecordURL('equipment-sets', set.slug)!)
      await expect(
        page.getByRole('region', { name: 'Состав сета' }).getByRole('heading', { level: 3 }),
      ).toHaveText([...parts].reverse().map((p) => p.name))
      await expect(page.getByRole('heading', { name: 'Как скрафтить' })).toHaveCount(0)
      const total = page.getByRole('region', { name: 'Всего для крафта сета' })
      await expect(total.getByRole('link')).toHaveCount(1)
      await expect(total).toContainText('Количество: 78')
      await expect(total).toContainText('Стоимость в монетах: 66')
      await expect(total.getByRole('link')).toHaveAttribute(
        'href',
        publicRecordURL('resources', resource.slug)!,
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: `test-results/set-${mobile ? 'mobile-dark' : 'desktop-light'}.png`,
        fullPage: true,
      })
      await expect(page.locator('article a[href^="/clothing/"]')).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Состав сета' }).getByRole('link')).toHaveCount(
        12,
      )
      await total.getByRole('link').click()
      await expect(page).toHaveURL(publicRecordURL('resources', resource.slug)!)
      await page.goto(publicRecordURL('clothing', parts[0].slug)!)
      await page.getByRole('link', { name: set.name, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(set.name)
      await page.goto(publicRecordURL('clothing', hazmat.slug)!)
      await expect(page.locator('#main-content')).not.toContainText('Сет:')
      await page.goto('/weapons')
      await expect(page.locator('main li a')).toHaveText([...weapons].reverse().map((w) => w.name))
      await page.getByRole('link', { name: weapons[0].name, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(weapons[0].name)
    }
    await page.goto(publicRecordURL('equipment-sets', empty.slug)!)
    await expect(page.getByText('Части сета пока не добавлены.')).toBeVisible()
    expect((await page.goto(`/clothing/sets/${fixtures.name()}`))?.status()).toBe(404)
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

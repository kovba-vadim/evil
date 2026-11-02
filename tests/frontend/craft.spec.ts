import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { publicRecordURL } from '../../src/lib/public-record-url'

test('craft includes only active results with canonical links, type labels and stable order', async ({
  page,
}) => {
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  const named = () => ({ name: fixtures.name(), slug: fixtures.name() })
  try {
    await page.goto('/craft')
    await expect(page.getByText('Предметы для крафта пока не добавлены.')).toBeVisible()
    const ingredient = await fixtures.create('ordinary-items', named())
    const set = await fixtures.create('equipment-sets', named())
    const expected = []
    const inactive = []
    for (const [kind, label] of [
      ['resources', 'Кастомный предмет'],
      ['clothing', 'Одежда'],
      ['weapons', 'Оружие'],
    ] as const) {
      const group = []
      for (let index = 11; index >= 0; index--) {
        const doc = await fixtures.create(kind, {
          ...named(),
          _order: `a${String.fromCharCode(65 + index)}`,
          ...(kind === 'clothing' ? { equipmentSet: index % 2 ? set.id : null } : {}),
          craftable: true,
          recipe: { coins: 0, ordinaryIngredients: [{ item: ingredient.id, quantity: 1 }] },
        })
        group.push({ ...doc, kind, label })
      }
      expected.push(...group.reverse())
      inactive.push(await fixtures.create(kind, { ...named(), craftable: false }))
    }
    for (const mobile of [false, true]) {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      )
      await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
      await page.goto('/craft')
      await expect(page.locator('html')).toHaveClass(mobile ? /dark/ : /light/)
      const links = page.locator('#main-content li a')
      await expect(links).toHaveCount(36)
      for (let index = 0; index < expected.length; index++) {
        const doc = expected[index]
        await expect(links.nth(index)).toHaveAttribute('href', publicRecordURL(doc.kind, doc.slug)!)
        await expect(links.nth(index)).toContainText(doc.name)
        await expect(links.nth(index)).toContainText(doc.label)
      }
      for (const doc of inactive)
        await expect(page.getByRole('link', { name: doc.name, exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: set.name, exact: true })).toHaveCount(0)
      await expect(
        page.getByRole('img', { name: `Нет изображения: ${expected[0].name}`, exact: true }),
      ).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: `test-results/craft-${mobile ? 'mobile-dark' : 'desktop-light'}.png`,
      })
      for (const kind of ['resources', 'clothing', 'weapons'] as const) {
        const doc = expected.find((doc) => doc.kind === kind)!
        await page.getByRole('link', { name: doc.name, exact: true }).click()
        await expect(page).toHaveURL(publicRecordURL(kind, doc.slug)!)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(doc.name)
        await page.goto('/craft')
      }
    }
    const doc = expected[0]
    await api.update({
      collection: doc.kind,
      id: doc.id,
      data: { craftable: false },
      overrideAccess: true,
    })
    await page.reload()
    await expect(page.locator('#main-content li a')).toHaveCount(35)
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

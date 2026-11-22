import { expect, test } from '@playwright/test'
import { ModelFixtures } from '../helpers/modelFixtures'
import { openTestPayload } from '../helpers/testDatabase'
import { publicRecordURL } from '../../src/lib/public-record-url'

test('shop cards on item details and conditional Payload admin fields', async ({ page }) => {
  test.setTimeout(60000)
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  const named = () => ({ name: fixtures.name(), slug: fixtures.name() })
  const shop = { enabled: true, price: 499, url: 'https://shop.example.test/product' }
  try {
    const set = await fixtures.create('equipment-sets', { ...named(), shop })
    const part = await fixtures.create('clothing', {
      ...named(),
      category: 'set',
      equipmentSet: set.id,
    })
    const hazmat = await fixtures.create('clothing', { ...named(), category: 'hazmat', shop })
    const ring = await fixtures.create('clothing', { ...named(), category: 'ring', shop })
    const disabled = await fixtures.create('resources', {
      ...named(),
      shop: { ...shop, enabled: false },
    })
    const ordinary = await fixtures.create('ordinary-items', { ...named(), shop })
    const custom = await fixtures.create('resources', { ...named(), shop })
    const weapon = await fixtures.create('weapons', { ...named(), shop })
    const card = page.getByRole('link', { name: /Можно приобрести в магазине/ })
    for (const [collection, item] of [
      ['equipment-sets', set],
      ['clothing', ring],
      ['clothing', hazmat],
      ['resources', custom],
      ['ordinary-items', ordinary],
      ['weapons', weapon],
    ] as const) {
      await page.goto(publicRecordURL(collection, item.slug)!)
      await expect(card).toBeVisible()
      await expect(card).toHaveAttribute('href', shop.url)
      await expect(card).toHaveAttribute('target', '_blank')
      await expect(card).toHaveAttribute('rel', 'noopener noreferrer')
      await expect(card).toContainText(/499\s*₽/)
      await expect(card).toContainText('Цена без учёта акций и скидок')
    }
    await page.setViewportSize({ width: 320, height: 640 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(publicRecordURL('clothing', ring.slug)!)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await card.focus()
    await expect(card).toBeFocused()
    await expect(card).toHaveCSS('outline-width', '2px')
    await expect(card).toHaveCSS('outline-style', 'solid')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.setViewportSize({ width: 1280, height: 900 })
    for (const [collection, item] of [
      ['clothing', part],
      ['resources', disabled],
    ] as const) {
      await page.goto(publicRecordURL(collection, item.slug)!)
      await expect(card).toHaveCount(0)
      const response = await page.request.get(`/api/${collection}/${item.id}?depth=0`)
      expect(response.ok()).toBe(true)
      expect(await response.json()).not.toHaveProperty('shop')
    }
    const password = crypto.randomUUID()
    const email = `${fixtures.name()}@example.test`
    await fixtures.create('users', { email, password })
    expect((await page.request.post('/api/users/login', { data: { email, password } })).ok()).toBe(
      true,
    )
    const enabled = page.getByRole('checkbox', { name: 'Можно купить в магазине' })
    const price = page.getByLabel('Стоимость в рублях')
    await page.goto(`/admin/collections/clothing/${part.id}`)
    await expect(enabled).toHaveCount(0)
    const refused = await page.request.patch(`/api/clothing/${part.id}`, { data: { shop } })
    expect(refused.status()).toBe(400)
    await page.goto(`/admin/collections/resources/${disabled.id}`)
    await expect(price).toHaveCount(0)
    await enabled.check()
    await expect(price).toHaveValue('499')
    await expect(page.getByLabel('Ссылка на товар в магазине')).toHaveValue(shop.url)
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes(`/api/resources/${disabled.id}`),
    )
    await page.getByRole('button', { name: /^(Save|Сохранить)$/ }).click()
    expect((await saved).ok()).toBe(true)
    await page.goto(publicRecordURL('resources', disabled.slug)!)
    await expect(card).toBeVisible()
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

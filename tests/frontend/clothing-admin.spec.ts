import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'

test('admin creates clothing in every category and clears its former set', async ({ page }) => {
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  try {
    const password = crypto.randomUUID()
    const email = `${fixtures.name()}@example.test`
    await fixtures.create('users', { email, password })
    const set = await fixtures.create('equipment-sets', {
      name: fixtures.name(),
      slug: fixtures.name(),
    })
    const login = await page.request.post('/api/users/login', { data: { email, password } })
    expect(login.ok()).toBe(true)
    const choose = async (field: string, label: string) => {
      await page.locator(`#field-${field}`).getByRole('combobox').click()
      await page.getByRole('option', { name: label, exact: true }).click()
    }
    const save = page.getByRole('button', { name: /^(Save|Сохранить)$/ })
    for (const [category, label] of [
      ['hazmat', 'Хазмат'],
      ['ring', 'Кольцо'],
      ['set', 'Часть сета'],
    ] as const) {
      await page.goto('/admin/collections/clothing/create')
      await page.locator('#field-name').fill(fixtures.name())
      await choose('category', label)
      const relationship = page.locator('#field-equipmentSet')
      if (category === 'set') {
        await expect(relationship).toBeVisible()
        await choose('equipmentSet', set.name)
      } else {
        await expect(relationship).toHaveCount(0)
      }
      await save.click()
      await expect(page).toHaveURL(/\/admin\/collections\/clothing\/\d+$/)
      const id = Number(new URL(page.url()).pathname.split('/').at(-1))
      const get = async () => {
        const response = await page.request.get(`/api/clothing/${id}?depth=0`)
        expect(response.ok()).toBe(true)
        return response.json()
      }
      expect(await get()).toMatchObject({ category, craftable: false })
      if (category === 'set') {
        expect(await get()).toMatchObject({ equipmentSet: set.id })
        await choose('category', 'Кольцо')
        await expect(relationship).toHaveCount(0)
        await save.click()
        await expect.poll(get).toMatchObject({ category: 'ring', equipmentSet: null })
        const badPatch = await page.request.patch(`/api/clothing/${id}`, {
          data: { category: 'set' },
        })
        expect(badPatch.status()).toBe(400)
        const patch = await page.request.patch(`/api/clothing/${id}`, {
          data: { category: 'set', equipmentSet: set.id },
        })
        expect(patch.ok()).toBe(true)
        expect(await get()).toMatchObject({ category: 'set', equipmentSet: set.id })
      }
    }
  } finally {
    await api.delete({
      collection: 'clothing',
      where: { name: { contains: fixtures.prefix } },
      overrideAccess: true,
    })
    await fixtures.cleanup()
    await api.destroy()
  }
})

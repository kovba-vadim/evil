import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { publicRecordURL } from '../../src/lib/public-record-url'

test('public catalog and resource/ordinary pages work on desktop/mobile and both themes', async ({
  page,
}) => {
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  const named = () => {
    const name = fixtures.name()
    return { name, slug: name }
  }
  try {
    const ingredient = await fixtures.create('resources', named())
    const plain = await fixtures.create('ordinary-items', {
      ...named(),
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
                  text: 'Описание обычного ресурса',
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
    })
    const item = await fixtures.create('resources', {
      ...named(),
      craftable: true,
      recipe: {
        coins: 15,
        resourceIngredients: [{ resource: ingredient.id, quantity: 2 }],
        ordinaryIngredients: [{ item: plain.id, quantity: 3 }],
      },
    })
    const event = await fixtures.create('events', {
      ...named(),
      coins: 0,
      cooldownMinutes: 0,
      rewards: [{ resource: item.id, minQuantity: 0, maxQuantity: 3 }],
    })
    const quest = await fixtures.create('quests', {
      ...named(),
      coins: 0,
      rewards: [{ resource: item.id, quantity: 2 }],
    })
    const boss = await fixtures.create('bosses', {
      ...named(),
      coins: 0,
      rewards: [{ resource: item.id, quantity: 1 }],
    })
    const active = await fixtures.create('resources', {
      ...named(),
      craftable: true,
      recipe: { coins: 0, resourceIngredients: [{ resource: item.id, quantity: 1 }] },
    })
    const inactive = await fixtures.create('weapons', {
      ...named(),
      craftable: false,
      recipe: { coins: 0, resourceIngredients: [{ resource: item.id, quantity: 1 }] },
    })
    const set = await fixtures.create('equipment-sets', named())
    const weapon = await fixtures.create('weapons', {
      ...named(),
      craftable: true,
      recipe: { coins: 4, resourceIngredients: [{ resource: item.id, quantity: 2 }] },
    })
    const clothing = await fixtures.create('clothing', {
      equipmentSet: set.id,
      description: plain.description,
      ...named(),
      craftable: true,
      recipe: { coins: 0, resourceIngredients: [{ resource: item.id, quantity: 1 }] },
    })
    for (let index = 0; index < 12; index++) await fixtures.create('resources', named())
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/items')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Кастом предметы')
    await expect(page.locator('main li a').filter({ hasText: fixtures.prefix })).toHaveCount(15)
    await expect(
      page.getByRole('img', { name: `Нет изображения: ${item.name}`, exact: true }),
    ).toBeVisible()
    await page.getByRole('link', { name: item.name, exact: true }).click()
    await expect(page).toHaveURL(publicRecordURL('resources', item.slug)!)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.name)
    const sources = page.getByRole('region', { name: 'Где получить' })
    for (const source of [event, quest, boss])
      await expect(sources.getByText(source.name, { exact: true })).toBeVisible()
    await expect(sources).toContainText('0–3')
    await expect(sources.getByRole('link', { name: boss.name })).toHaveAttribute(
      'href',
      publicRecordURL('bosses', boss.slug)!,
    )
    const uses = page.getByRole('region', { name: 'Используется в крафте' })
    await expect(uses.getByRole('link', { name: active.name })).toHaveAttribute(
      'href',
      publicRecordURL('resources', active.slug)!,
    )
    await expect(uses.getByText(clothing.name, { exact: true })).toBeVisible()
    await expect(uses.getByRole('link', { name: clothing.name })).toHaveAttribute(
      'href',
      publicRecordURL('clothing', clothing.slug)!,
    )
    await expect(uses.getByText(inactive.name)).toHaveCount(0)
    const recipe = page.getByRole('region', { name: 'Как скрафтить' })
    await expect(recipe).toContainText('Стоимость в монетах: 15')
    await expect(recipe.getByRole('link')).toHaveCount(2)
    await page.screenshot({ path: 'test-results/items-desktop.png' })
    await recipe.getByRole('link').filter({ hasText: plain.name }).click()
    await expect(page).toHaveURL(publicRecordURL('ordinary-items', plain.slug)!)
    await expect(page.getByText('Описание обычного ресурса')).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(publicRecordURL('resources', item.slug)!)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.name)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/items-mobile-dark.png', fullPage: true })
    await api.update({
      collection: 'resources',
      id: item.id,
      data: { craftable: false },
      overrideAccess: true,
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Как скрафтить' })).toHaveCount(0)

    for (const [kind, record] of [
      ['clothing', clothing],
      ['weapons', weapon],
    ] as const) {
      for (const mobile of [false, true]) {
        await page.setViewportSize(
          mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        )
        await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
        await page.goto(publicRecordURL('resources', item.slug)!)
        await page
          .getByRole('region', { name: 'Используется в крафте' })
          .getByRole('link', { name: record.name })
          .click()
        await expect(page).toHaveURL(publicRecordURL(kind, record.slug)!)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(record.name)
        await expect(page.getByRole('region', { name: 'Как скрафтить' })).toBeVisible()
        if (kind === 'clothing') {
          await expect(page.getByText(`Сет: ${set.name}`)).toBeVisible()
          await expect(page.getByText('Описание обычного ресурса')).toBeVisible()
          await expect(page.getByRole('link', { name: set.name, exact: true })).toHaveAttribute(
            'href',
            publicRecordURL('equipment-sets', set.slug)!,
          )
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.screenshot({
          path: `test-results/${kind}-${mobile ? 'mobile-dark' : 'desktop-light'}.png`,
          fullPage: true,
        })
      }
      await api.update({
        collection: kind,
        id: record.id,
        data: { craftable: false },
        overrideAccess: true,
      })
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Как скрафтить' })).toHaveCount(0)
      expect((await page.goto(`/${kind}/${fixtures.name()}`))?.status()).toBe(404)
    }
    const missing = await page.goto(`/items/${fixtures.name()}`)
    expect(missing?.status()).toBe(404)
    const missingPlain = await page.goto(`/ordinary-resources/${fixtures.name()}`)
    expect(missingPlain?.status()).toBe(404)
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

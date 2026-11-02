import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { publicRecordURL } from '../../src/lib/public-record-url'
import type { Boss } from '../../src/payload-types'

test('boss catalog and reward roundtrip work in both themes and on mobile', async ({ page }) => {
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  const named = () => ({ name: fixtures.name(), slug: fixtures.name() })
  try {
    await page.goto('/bosses')
    await expect(page.getByText('Ивент-боссы пока не добавлены.')).toBeVisible()
    const resources = []
    for (let index = 0; index < 3; index++)
      resources.push(await fixtures.create('resources', named()))
    const bosses: Boss[] = []
    for (let index = 11; index >= 0; index--)
      bosses.push(
        await fixtures.create('bosses', {
          ...named(),
          _order: `a${String.fromCharCode(65 + index)}`,
          coins: index,
          rewards: resources.map((resource, row) => ({ resource: resource.id, quantity: row + 2 })),
        }),
      )
    const boss = bosses[0]
    await api.update({
      collection: 'bosses',
      id: boss.id,
      overrideAccess: true,
      data: {
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
                    text: 'Описание ивент-босса',
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
      },
    })
    const empty = await fixtures.create('bosses', { ...named(), coins: 0, rewards: [] })
    for (const mobile of [false, true]) {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      )
      await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
      await page.goto('/bosses')
      await expect(page.locator('html')).toHaveClass(mobile ? /dark/ : /light/)
      const cards = page
        .getByRole('region', { name: 'Ивент-боссы', exact: true })
        .locator(':scope > ul > li')
      await expect(cards).toHaveCount(13)
      const titles = cards.locator('h2')
      const names = await titles.allTextContents()
      expect(names.filter((name) => name !== empty.name)).toEqual(
        [...bosses].reverse().map((b) => b.name),
      )
      await expect(
        cards.filter({ has: page.getByRole('heading', { name: boss.name, exact: true }) }),
      ).toContainText('Монеты: 11')
      await page.screenshot({
        path: `test-results/bosses-${mobile ? 'mobile-dark' : 'desktop-light'}.png`,
      })
      await page.goto(publicRecordURL('resources', resources[0].slug)!)
      await page
        .getByRole('region', { name: 'Где получить' })
        .getByRole('link', { name: boss.name, exact: true })
        .click()
      await expect(page).toHaveURL(publicRecordURL('bosses', boss.slug)!)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(boss.name)
      await expect(page.getByText('Монеты: 11', { exact: true })).toBeVisible()
      await expect(page.getByText('Описание ивент-босса', { exact: true })).toBeVisible()
      const rewards = page.getByRole('region', { name: 'Возможные награды' })
      await expect(rewards.getByRole('link')).toHaveCount(3)
      for (let index = 0; index < 3; index++) {
        await expect(rewards).toContainText(`Количество: ${index + 2}`)
        await expect(
          rewards.getByRole('link', { name: resources[index].name, exact: true }),
        ).toHaveAttribute('href', publicRecordURL('resources', resources[index].slug)!)
      }
      await expect(page.getByRole('img', { name: `Нет изображения: ${boss.name}` })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await rewards.getByRole('link', { name: resources[0].name, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(resources[0].name)
    }
    await page.goto(publicRecordURL('bosses', empty.slug)!)
    await expect(page.locator('#main-content .homepage-richtext')).toHaveCount(0)
    await expect(page.getByText('Предметные награды пока не указаны.')).toBeVisible()
    expect((await page.goto(`/bosses/${fixtures.name()}`))?.status()).toBe(404)
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

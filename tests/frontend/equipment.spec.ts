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
  const tab = (name: string) => page.getByRole('tab', { name, exact: true })
  const panel = (name: string) => page.getByRole('tabpanel', { name, exact: true })
  try {
    await page.goto('/clothing')
    await expect(page.getByRole('tab')).toHaveText(['Сеты', 'Хазматы', 'Кольца'])
    await expect(tab('Сеты')).toHaveAttribute('aria-selected', 'true')
    const emptyMessage = 'В этой категории пока нет предметов'
    await expect(panel('Сеты')).toHaveText(emptyMessage)
    await tab('Хазматы').click()
    await expect(panel('Хазматы')).toHaveText(emptyMessage)
    await tab('Кольца').click()
    await expect(panel('Кольца')).toHaveText(emptyMessage)
    await page.goto('/weapons')
    await expect(page.getByText('Оружие пока не добавлено.')).toBeVisible()
    const set = await fixtures.create('equipment-sets', named(0))
    const empty = await fixtures.create('equipment-sets', named(1))
    const third = await fixtures.create('equipment-sets', named(2))
    const fourth = await fixtures.create('equipment-sets', named(3))
    const hazmat = await fixtures.create('clothing', {
      ...named(0),
      category: 'hazmat',
      equipmentSet: null,
    })
    await page.goto('/clothing')
    await tab('Кольца').click()
    await expect(panel('Кольца')).toHaveText(emptyMessage)
    const ring = await fixtures.create('clothing', { ...named(1), category: 'ring' })
    const resource = await fixtures.create('resources', named(0))
    const parts = [],
      weapons = []
    for (let index = 11; index >= 0; index--) {
      parts.push(
        await fixtures.create('clothing', {
          ...named(index),
          category: 'set',
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
        mobile ? { width: 320, height: 844 } : { width: 1280, height: 900 },
      )
      await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
      await page.goto('/clothing')
      await expect(page.locator('html')).toHaveClass(mobile ? /dark/ : /light/)
      await expect(tab('Сеты')).toHaveAttribute('aria-selected', 'true')
      await expect(panel('Сеты').getByRole('link')).toHaveText(
        [set, empty, third, fourth].map(({ name }) => name),
      )
      await expect(page.locator('html')).toHaveCSS('scrollbar-gutter', 'stable')
      const contentWidth = () => page.locator('#main-content').evaluate((main) => main.clientWidth)
      const setsWidth = await contentWidth()
      await tab('Сеты').focus()
      await page.keyboard.press('ArrowRight')
      await expect(tab('Хазматы')).toBeFocused()
      await expect(panel('Сеты')).toBeHidden()
      const hazmats = panel('Хазматы')
      await expect(hazmats.getByRole('link')).toHaveText([hazmat.name])
      expect(await contentWidth()).toBe(setsWidth)
      await expect(hazmats.getByRole('link')).toHaveAttribute(
        'href',
        `${publicRecordURL('clothing', hazmat.slug)}`,
      )
      await page.keyboard.press('End')
      await expect(tab('Кольца')).toBeFocused()
      await expect(hazmats).toBeHidden()
      await expect(panel('Кольца').getByRole('link')).toHaveText([ring.name])
      expect(await contentWidth()).toBe(setsWidth)
      await page.keyboard.press('Home')
      await expect(tab('Сеты')).toBeFocused()
      await expect(panel('Сеты')).toBeVisible()
      for (const width of mobile ? [320, 430] : [1280]) {
        await page.setViewportSize({ width, height: 844 })
        expect(
          await page.getByRole('tablist').evaluate((list) => {
            const tabs = [...list.querySelectorAll<HTMLElement>('[role=tab]')]
            return (
              tabs.every(
                (tab) => tab.offsetTop === tabs[0].offsetTop && tab.scrollWidth <= tab.clientWidth,
              ) && document.documentElement.scrollWidth <= innerWidth
            )
          }),
        ).toBe(true)
      }
      await tab('Кольца').click()
      await expect(page).toHaveURL('/clothing?tab=rings')
      await panel('Кольца').getByRole('link', { name: ring.name }).click()
      await expect(page).toHaveURL(`${publicRecordURL('clothing', ring.slug)}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(ring.name)
      await page.goto('/clothing')
      await page.getByRole('link', { name: set.name, exact: true }).click()
      await expect(page).toHaveURL(`${publicRecordURL('equipment-sets', set.slug)}`)
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
        `${publicRecordURL('resources', resource.slug)}`,
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
      await expect(page).toHaveURL(`${publicRecordURL('resources', resource.slug)}`)
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

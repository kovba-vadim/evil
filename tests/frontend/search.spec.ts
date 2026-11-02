import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { collidingRewards } from '../helpers/collidingRewards'
import { SEARCH_TYPES } from '../../src/lib/search'
import { publicRecordURL } from '../../src/lib/public-record-url'
test('global search is bounded, ranked, keyboard accessible and works through mobile dialogs', async ({
  page,
  request,
}) => {
  test.setTimeout(90000)
  const api = await openTestPayload(),
    fixtures = new ModelFixtures(api)
  const named = () => ({ name: fixtures.name(), slug: fixtures.name() })
  const query = `${fixtures.prefix}-needle`,
    common = `Кристалл Evil ${query}`
  try {
    const pair = await collidingRewards(fixtures, fixtures.name()),
      docs = []
    for (const { kind, label } of SEARCH_TYPES) {
      if (kind === 'resources' || kind === 'ordinary-items') {
        const doc = kind === 'resources' ? pair.custom : pair.ordinary
        await api.update({
          collection: kind,
          id: doc.id,
          data: { name: common },
          overrideAccess: true,
        })
        docs.push({ kind, label, id: doc.id, slug: doc.slug, name: common })
      } else {
        const doc = await fixtures.create(kind, {
          ...named(),
          name: common,
          coins: 0,
          cooldownMinutes: 0,
        })
        docs.push({ kind, label, id: doc.id, slug: doc.slug, name: common })
      }
    }
    await fixtures.create('resources', { ...named(), name: `x ${query}` })
    for (let index = 0; index < 6; index++)
      await fixtures.create('weapons', { ...named(), name: `${query} ${index}` })
    const oldQuery = fixtures.name(),
      newQuery = fixtures.name()
    const old = await fixtures.create('resources', { ...named(), name: `Old ${oldQuery}` }),
      latest = await fixtures.create('resources', { ...named(), name: `New ${newQuery}` })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.emulateMedia({ colorScheme: 'light' })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    let queries = 0
    page.on('request', (req) => {
      if (req.url().includes('/api/public/search')) queries++
    })
    const trigger = page.getByRole('button', { name: 'Поиск', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Поиск EvilIsland', exact: true }),
      input = dialog.getByRole('combobox', { name: 'Поисковый запрос', exact: true })
    await expect(input).toBeFocused()
    await expect(dialog.getByText('Введите минимум два символа.')).toBeVisible()
    await input.fill('a')
    await page.waitForTimeout(350)
    expect(queries).toBe(0)
    await input.fill(common.toUpperCase())
    await input.fill(`  ${common.toUpperCase()}  `)
    await expect(dialog.getByText('Ищем…', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('option')).toHaveCount(8)
    for (const doc of docs) {
      const option = dialog.locator(`[data-value="${doc.kind}:${doc.id}"]`)
      await expect(option).toContainText(doc.label)
      await expect(option).toHaveAttribute('href', publicRecordURL(doc.kind, doc.slug)!)
    }
    expect(pair.custom.id).toBe(pair.ordinary.id)
    await input.press('ArrowDown')
    await input.press('Enter')
    await expect(page).toHaveURL(
      publicRecordURL('quests', docs.find((doc) => doc.kind === 'quests')!.slug)!,
    )
    await expect(dialog).toHaveCount(0)
    await trigger.focus()
    await page.keyboard.press('Control+k')
    await expect(input).toBeFocused()
    await input.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Meta+k')
    await expect(input).toBeFocused()
    await input.press('Escape')
    await expect(trigger).toBeFocused()
    await page.getByRole('button', { name: 'Свернуть меню', exact: true }).click()
    await trigger.focus()
    await expect(page.getByRole('tooltip')).toContainText('Поиск')
    await trigger.click()
    await expect(input).toBeFocused()
    await input.fill(query)
    await expect(dialog.getByText(/Есть дополнительные результаты/)).toBeVisible()
    await expect(dialog.getByRole('option')).toHaveCount(13)
    const response = await request.get(`/api/public/search?q=${encodeURIComponent(query)}`)
    const data = await response.json()
    for (const { kind } of SEARCH_TYPES)
      expect(
        data.results.filter((row: { kind: string }) => row.kind === kind).length,
      ).toBeLessThanOrEqual(5)
    expect(data.more).toContainEqual({ kind: 'weapons', label: 'Оружие' })
    await input.fill(fixtures.name())
    await expect(dialog.getByText('Ничего не найдено.')).toBeVisible()
    const before = queries
    await input.fill('te')
    await input.fill('tes')
    await input.fill(common)
    await expect(dialog.getByRole('option')).toHaveCount(8)
    expect(queries - before).toBe(1)
    await page.route('**/api/public/search?*', async (route) => {
      const result = await route.fetch()
      if (new URL(route.request().url()).searchParams.get('q') === oldQuery)
        await new Promise((resolve) => setTimeout(resolve, 700))
      await route.fulfill({ response: result }).catch(() => {})
    })
    const started = page.waitForRequest(
      (req) =>
        req.url().includes('/api/public/search') &&
        new URL(req.url()).searchParams.get('q') === oldQuery,
    )
    await input.fill(oldQuery)
    await started
    await input.fill(newQuery)
    await expect(dialog.getByRole('option')).toHaveCount(1)
    await expect(dialog.getByRole('option')).toContainText(latest.name)
    await page.waitForTimeout(800)
    await expect(dialog.getByText(old.name, { exact: true })).toHaveCount(0)
    await page.unroute('**/api/public/search?*')
    await page.route('**/api/public/search?*', (route) =>
      route.fulfill({ status: 500, body: 'unavailable' }),
    )
    await input.fill(query)
    await expect(dialog.getByRole('alert')).toContainText('Поиск временно недоступен.')
    await page.unroute('**/api/public/search?*')
    await dialog.getByRole('button', { name: 'Повторить', exact: true }).click()
    await expect(dialog.getByRole('option')).toHaveCount(data.results.length)
    await expect(input).toBeFocused()
    await expect(page.locator('html')).toHaveClass(/light/)
    await page.screenshot({ path: 'test-results/search-desktop-light.png' })
    await input.press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click()
    await trigger.click()
    await expect(input).toBeFocused()
    await input.fill(common)
    await expect(dialog.getByRole('option')).toHaveCount(8)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.screenshot({ path: 'test-results/search-mobile-dark.png' })
    await input.press('Escape')
    await expect(trigger).toBeFocused()
    await trigger.click()
    await expect(input).toBeFocused()
    const ordinary = docs.find((doc) => doc.kind === 'ordinary-items')!
    await input.fill('')
    await input.fill(common)
    await expect(dialog.getByRole('option')).toHaveCount(8)
    await input.press('ArrowUp')
    await expect(dialog.locator('[role="option"][aria-selected="true"]')).toHaveAttribute(
      'data-value',
      `ordinary-items:${ordinary.id}`,
    )
    await input.press('Enter')
    await expect(page).toHaveURL(publicRecordURL('ordinary-items', ordinary.slug)!)
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Меню EvilIsland' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(common)
    expect((await request.get('/api/public/search?q=')).status()).toBe(200)
    expect((await (await request.get('/api/public/search?q=x')).json()).results).toEqual([])
    expect((await request.get('/api/public/search?q=x&q=y')).status()).toBe(400)
    expect((await request.get(`/api/public/search?q=${'a'.repeat(101)}`)).status()).toBe(400)
    expect((await request.post('/api/public/search', { data: { q: query } })).status()).toBe(405)
    expect(errors).toEqual([])
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

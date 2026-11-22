import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { TIME_ZONE_STORAGE_KEY, formatLaunch } from '../../src/lib/time-zones'
import { publicRecordURL } from '../../src/lib/public-record-url'
test('launch schedule shares persisted zones with event details, combines filters and avoids stale replies', async ({
  page,
  request,
}) => {
  const openFilters = async () => {
    if (!(await page.getByRole('dialog').isVisible()))
      await page.getByRole('button', { name: /^Фильтры/ }).click()
  }
  const apply = async () => {
    if (await page.getByRole('dialog').isVisible())
      await page.getByRole('button', { name: 'Показать результаты', exact: true }).click()
  }
  const api = await openTestPayload(),
    fixtures = new ModelFixtures(api)
  const named = () => ({ name: fixtures.name(), slug: fixtures.name() })
  const hydrationErrors: string[] = []
  page.on('pageerror', (error) => hydrationErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat|did not match/i.test(message.text()))
      hydrationErrors.push(message.text())
  })
  try {
    const a = await fixtures.create('resources', named()),
      b = await fixtures.create('resources', named()),
      times = []
    for (const time of ['00:05', '12:00', '23:55']) {
      const found = await api.find({
        collection: 'event-times',
        where: { time: { equals: time } },
        overrideAccess: false,
        user: null,
      })
      times.push(found.docs[0] ?? (await fixtures.create('event-times', { time, minutes: 0 })))
    }
    const event = await fixtures.create('events', {
      ...named(),
      coins: 10,
      durationMinutes: 30,
      cooldownMinutes: 0,
      launchTimes: times.map((time) => time.id),
      rewards: [
        { resource: a.id, minQuantity: 0, maxQuantity: 3 },
        { resource: b.id, minQuantity: 1, maxQuantity: 2 },
      ],
    })
    const other = await fixtures.create('events', {
      ...named(),
      coins: 20,
      durationMinutes: 30,
      cooldownMinutes: 0,
      launchTimes: [times[0].id],
      rewards: [{ resource: a.id, minQuantity: 1, maxQuantity: 1 }],
    })
    await fixtures.create('events', {
      ...named(),
      coins: 0,
      durationMinutes: 30,
      cooldownMinutes: 0,
    })
    await page.setViewportSize({ width: 320, height: 540 })
    for (const path of ['/events', '/bosses', publicRecordURL('events', event.slug)!]) {
      await page.goto(path)
      await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      )
    }
    await page.addInitScript(
      ({ key }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, 'bad-zone')
      },
      { key: TIME_ZONE_STORAGE_KEY },
    )
    await page.goto('/event-launches')
    const rail = page.locator('[data-slot="sidebar-container"]')
    const bounds = await rail.boundingBox()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    expect(await rail.boundingBox()).toEqual(bounds)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    const card = page.locator(`li:has(a[href="${publicRecordURL('events', event.slug)}"])`).first()
    const cardWidth = (await card.boundingBox())!.width
    await page.getByRole('button', { name: 'Открыть меню' }).click()
    await expect(page.getByRole('dialog', { name: 'Меню EvilIsland' })).toBeVisible()
    expect((await card.boundingBox())!.width).toBe(cardWidth)
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1280, height: 900 })
    const zone = page.getByRole('combobox', { name: 'Часовой пояс', exact: true })
    await expect(zone).toHaveValue('server')
    await apply()
    await expect(page.getByText('Запусков: 4', { exact: true })).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key), TIME_ZONE_STORAGE_KEY)).toBe(
      'server',
    )
    await zone.focus()
    await zone.press('Home')
    await zone.press('ArrowDown')
    await zone.press('ArrowDown')
    await zone.press('Enter')
    await expect(zone).toHaveValue('Europe/Berlin')
    await apply()
    await expect(page.getByText('Запусков: 4', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: event.name, exact: true }).first().click()
    await expect(page).toHaveURL(`${publicRecordURL('events', event.slug)}`)
    await expect(zone).toHaveValue('Europe/Berlin')
    const detailSchedule = page.getByRole('region', { name: 'Времена запуска', exact: true })
    const launchTimes = detailSchedule.locator('time')
    await expect(launchTimes).toHaveCount(3)
    for (const time of await launchTimes.all()) {
      const instant = (await time.getAttribute('datetime'))!
      const formatted = formatLaunch(instant, 'Europe/Berlin', new Date().toISOString(), 'ru')
      await expect(time).toHaveText(`${formatted.date} — ${formatted.time}`)
    }
    await zone.selectOption('Asia/Yekaterinburg')
    await expect(zone.locator('option:checked')).toHaveText('Екатеринбург — UTC+5')
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(rail).toHaveCSS('width', width === 320 ? '48px' : '256px')
      const label = (await detailSchedule.getByText('Часовой пояс', { exact: true }).boundingBox())!
      const select = (await zone.boundingBox())!
      const section = (await detailSchedule.boundingBox())!
      expect(label.x + label.width).toBeLessThan(select.x)
      expect(label.y + label.height / 2).toBeCloseTo(select.y + select.height / 2, 0)
      expect(select.x + select.width).toBeLessThanOrEqual(section.x + section.width + 1)
      expect(section.x + section.width).toBeLessThanOrEqual(width)
    }
    await zone.selectOption('America/New_York')
    for (const time of await launchTimes.all()) {
      const instant = (await time.getAttribute('datetime'))!
      const formatted = formatLaunch(instant, 'America/New_York', new Date().toISOString(), 'ru')
      await expect(time).toHaveText(`${formatted.date} — ${formatted.time}`)
    }
    await page.goto('/event-launches')
    await expect(zone).toHaveValue('America/New_York')
    await page.reload()
    await expect(zone).toHaveValue('America/New_York')
    const from = page.getByLabel('Время От', { exact: true }),
      to = page.getByLabel('Время До', { exact: true })
    await openFilters()
    await from.fill('23:00')
    await apply()
    await expect(
      page.getByText('Заполните обе границы времени. Пока показаны ближайшие 24 часа.'),
    ).toBeVisible()
    await openFilters()
    await to.fill('01:00')
    await apply()
    await zone.selectOption('server')
    await openFilters()
    await expect(from).toHaveValue('23:00')
    await openFilters()
    await expect(to).toHaveValue('01:00')
    const cleared = page.waitForRequest(
      (req) =>
        req.url().endsWith('/api/public/event-launches') &&
        req.postDataJSON().from === '' &&
        req.postDataJSON().to === '',
    )
    await openFilters()
    await from.fill('')
    await openFilters()
    await to.fill('')
    await apply()
    await cleared
    await apply()
    await expect(page.getByText('Запусков: 4', { exact: true })).toBeVisible()
    await openFilters()
    await from.fill('23:00')
    await openFilters()
    await to.fill('01:00')
    await openFilters()
    await page.getByRole('spinbutton', { name: 'Монеты От', exact: true }).fill('10')
    await openFilters()
    await page.getByRole('spinbutton', { name: 'Монеты До', exact: true }).fill('10')
    await openFilters()
    await page.getByRole('checkbox', { name: a.name, exact: true }).check()
    await openFilters()
    await page.getByRole('checkbox', { name: b.name, exact: true }).check()
    await apply()
    await expect(page.getByText('Запусков: 2', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: other.name, exact: true })).toHaveCount(0)
    await expect(page.locator('#main-content time')).toHaveCount(2)
    await openFilters()
    await page.getByRole('spinbutton', { name: 'Монеты От', exact: true }).fill('11')
    await openFilters()
    await page.getByRole('spinbutton', { name: 'Монеты До', exact: true }).fill('11')
    await apply()
    await expect(page.getByText('Запуски по выбранным условиям не найдены.')).toBeVisible()
    await openFilters()
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await openFilters()
    await expect(from).toHaveValue('')
    await openFilters()
    await expect(to).toHaveValue('')
    await apply()
    await expect(page.getByText('Запусков: 4', { exact: true })).toBeVisible()
    await page.route('**/api/public/event-launches', async (route) => {
      const response = await route.fetch()
      if (route.request().postDataJSON().coinsFrom === 11)
        await new Promise((resolve) => setTimeout(resolve, 700))
      await route.fulfill({ response }).catch(() => {})
    })
    const started = page.waitForRequest(
      (req) =>
        req.url().endsWith('/api/public/event-launches') && req.postDataJSON().coinsFrom === 11,
    )
    await openFilters()
    await page.getByRole('spinbutton', { name: 'Монеты От', exact: true }).fill('11')
    await apply()
    await started
    await openFilters()
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await apply()
    await expect(page.getByText('Запусков: 4', { exact: true })).toBeVisible()
    await page.waitForTimeout(800)
    await apply()
    await expect(page.getByText('Запусков: 4', { exact: true })).toBeVisible()
    await page.unroute('**/api/public/event-launches')
    for (const mobile of [false, true]) {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      )
      await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
      await page.goto('/event-launches')
      await expect(page.locator('html')).toHaveClass(mobile ? /dark/ : /light/)
      await apply()
      await expect(page.getByText('Запусков: 4', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: `test-results/launches-${mobile ? 'mobile-dark' : 'desktop-light'}.png`,
        fullPage: true,
      })
    }
    const invalid = await request.post('/api/public/event-launches', {
      data: { zone: 'bad', from: '99:00' },
    })
    expect(invalid.status()).toBe(400)
    expect(hydrationErrors).toEqual([])
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

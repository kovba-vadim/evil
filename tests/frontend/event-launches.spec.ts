import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import { TIME_ZONE_STORAGE_KEY, formatLaunch } from '../../src/lib/time-zones'
import { publicRecordURL } from '../../src/lib/public-record-url'
test('launch schedule shares persisted zones with event details, combines filters and avoids stale replies', async ({
  page,
  request,
}) => {
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
      cooldownMinutes: 0,
      launchTimes: [times[0].id],
      rewards: [{ resource: a.id, minQuantity: 1, maxQuantity: 1 }],
    })
    await fixtures.create('events', { ...named(), coins: 0, cooldownMinutes: 0 })
    await page.addInitScript(
      ({ key }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, 'bad-zone')
      },
      { key: TIME_ZONE_STORAGE_KEY },
    )
    await page.goto('/event-launches')
    const zone = page.getByRole('combobox', { name: 'Часовой пояс', exact: true })
    await expect(zone).toHaveValue('server')
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
    await expect(page.getByText('Запусков: 4', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: event.name, exact: true }).first().click()
    await expect(page).toHaveURL(publicRecordURL('events', event.slug)!)
    await expect(zone).toHaveValue('Europe/Berlin')
    const launchTimes = page.locator('#main-content time')
    await expect(launchTimes).toHaveCount(3)
    for (const time of await launchTimes.all()) {
      const instant = (await time.getAttribute('datetime'))!
      const formatted = formatLaunch(instant, 'Europe/Berlin', new Date().toISOString())
      await expect(time).toContainText(formatted.time)
      await expect(time).toContainText(formatted.offset)
    }
    await zone.selectOption('America/New_York')
    await page.goto('/event-launches')
    await expect(zone).toHaveValue('America/New_York')
    await page.reload()
    await expect(zone).toHaveValue('America/New_York')
    const from = page.getByLabel('Время От', { exact: true }),
      to = page.getByLabel('Время До', { exact: true })
    await from.fill('23:00')
    await expect(
      page.getByText('Заполните обе границы времени. Пока показаны ближайшие 24 часа.'),
    ).toBeVisible()
    await to.fill('01:00')
    await zone.selectOption('server')
    await expect(from).toHaveValue('23:00')
    await expect(to).toHaveValue('01:00')
    const cleared = page.waitForRequest(
      (req) =>
        req.url().endsWith('/api/public/event-launches') &&
        req.postDataJSON().from === '' &&
        req.postDataJSON().to === '',
    )
    await from.fill('')
    await to.fill('')
    await cleared
    await expect(page.getByText('Запусков: 4', { exact: true })).toBeVisible()
    await from.fill('23:00')
    await to.fill('01:00')
    await page.getByRole('spinbutton', { name: 'Монеты От', exact: true }).fill('10')
    await page.getByRole('spinbutton', { name: 'Монеты До', exact: true }).fill('10')
    await page.getByRole('checkbox', { name: a.name, exact: true }).check()
    await page.getByRole('checkbox', { name: b.name, exact: true }).check()
    await expect(page.getByText('Запусков: 2', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: other.name, exact: true })).toHaveCount(0)
    await expect(page.locator('#main-content time')).toHaveCount(2)
    await page.getByRole('spinbutton', { name: 'Монеты От', exact: true }).fill('11')
    await page.getByRole('spinbutton', { name: 'Монеты До', exact: true }).fill('11')
    await expect(page.getByText('Запуски по выбранным условиям не найдены.')).toBeVisible()
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await expect(from).toHaveValue('')
    await expect(to).toHaveValue('')
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
    await page.getByRole('spinbutton', { name: 'Монеты От', exact: true }).fill('11')
    await started
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await expect(page.getByText('Запусков: 4', { exact: true })).toBeVisible()
    await page.waitForTimeout(800)
    await expect(page.getByText('Запусков: 4', { exact: true })).toBeVisible()
    await page.unroute('**/api/public/event-launches')
    for (const mobile of [false, true]) {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      )
      await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
      await page.goto('/event-launches')
      await expect(page.locator('html')).toHaveClass(mobile ? /dark/ : /light/)
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

import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'
import type { Event } from '../../src/payload-types'
import { publicRecordURL } from '../../src/lib/public-record-url'

test('events filters, rapid edits, roundtrip, schedule and edge states', async ({
  page,
  request,
}) => {
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  const named = () => ({ name: fixtures.name(), slug: fixtures.name() })
  try {
    await page.goto('/events')
    await expect(page.getByText('Ивенты пока не добавлены.')).toBeVisible()
    const a = await fixtures.create('resources', named()),
      b = await fixtures.create('resources', named())
    const times = []
    for (const time of ['23:45', '00:15', '12:00']) {
      const found = await api.find({
        collection: 'event-times',
        where: { time: { equals: time } },
        overrideAccess: false,
        user: null,
      })
      times.push(found.docs[0] ?? (await fixtures.create('event-times', { time, minutes: 0 })))
    }
    const events: Event[] = []
    for (let index = 11; index >= 0; index--)
      events.push(
        await fixtures.create('events', {
          ...named(),
          _order: `a${String.fromCharCode(65 + index)}`,
          coins: index,
          cooldownMinutes: 90,
          shortDescription: 'Краткое описание ивента',
          launchTimes: times.map((time) => time.id),
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
                      text: 'Полное описание ивента',
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
          rewards: [
            { resource: a.id, minQuantity: 0, maxQuantity: 3 },
            ...(index % 2 === 0 ? [{ resource: b.id, minQuantity: 1, maxQuantity: 2 }] : []),
          ],
        }),
      )
    await page.goto('/events')
    const cards = page.locator('#main-content a[href^="/events/"]')
    await expect(page.getByText('Найдено: 12', { exact: true })).toBeVisible()
    expect(await cards.allTextContents()).toEqual([...events].reverse().map((event) => event.name))
    const from = page.getByRole('spinbutton', { name: 'Монеты От', exact: true }),
      to = page.getByRole('spinbutton', { name: 'Монеты До', exact: true })
    await from.fill('2')
    await to.fill('8')
    await expect(page.getByText('Найдено: 7', { exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: a.name, exact: true }).check()
    await page.getByRole('checkbox', { name: b.name, exact: true }).check()
    await expect(page.getByText('Найдено: 4', { exact: true })).toBeVisible()
    const filtered = events
      .filter((event) => event.coins >= 2 && event.coins <= 8 && event.coins % 2 === 0)
      .reverse()
    for (const event of filtered)
      await expect(page.getByRole('link', { name: event.name, exact: true })).toBeVisible()
    await expect(from).toHaveAttribute('min', '0')
    await expect(to).toHaveAttribute('max', '11')
    await from.fill('3')
    await to.fill('3')
    await expect(page.getByText('Ивенты по выбранным условиям не найдены.')).toBeVisible()
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await expect(page.getByText('Найдено: 12', { exact: true })).toBeVisible()
    await from.fill('0')
    await to.fill('0')
    await expect(page.getByText('Найдено: 1', { exact: true })).toBeVisible()
    await expect(page.getByRole('slider', { name: 'Монеты до', exact: true })).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    let queries = 0
    page.on('request', (req) => {
      if (req.url().endsWith('/api/public/events')) queries++
    })
    await from.fill('1')
    await from.fill('2')
    await from.fill('3')
    await expect(page.getByText('Найдено: 9', { exact: true })).toBeVisible()
    expect(queries).toBe(1)
    await page.route('**/api/public/events', async (route) => {
      const response = await route.fetch()
      const body = route.request().postDataJSON()
      if (body.coinsFrom === 4) await new Promise((resolve) => setTimeout(resolve, 700))
      await route.fulfill({ response }).catch(() => {})
    })
    const started = page.waitForRequest(
      (req) => req.url().endsWith('/api/public/events') && req.postDataJSON().coinsFrom === 4,
    )
    await from.fill('4')
    await started
    await from.fill('8')
    await expect(page.getByText('Найдено: 4', { exact: true })).toBeVisible()
    await page.waitForTimeout(800)
    await expect(page.getByText('Найдено: 4', { exact: true })).toBeVisible()
    await page.unroute('**/api/public/events')
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    const lower = page.getByRole('slider', { name: 'Монеты от', exact: true })
    await lower.focus()
    await lower.press('ArrowRight')
    await lower.press('ArrowRight')
    await expect(from).toHaveValue('2')
    await expect(page.getByText('Найдено: 10', { exact: true })).toBeVisible()
    for (const mobile of [false, true]) {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      )
      await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
      await page.goto('/events')
      await expect(page.locator('html')).toHaveClass(mobile ? /dark/ : /light/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: `test-results/events-${mobile ? 'mobile-dark' : 'desktop-light'}.png`,
      })
      await page.goto(publicRecordURL('resources', a.slug)!)
      await page
        .getByRole('region', { name: 'Где получить' })
        .getByRole('link', { name: events[0].name, exact: true })
        .click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(events[0].name)
      await expect(page.getByText('Полное описание ивента', { exact: true })).toBeVisible()
      await expect(page.getByText('КД прохождения: 90 мин.', { exact: true })).toBeVisible()
      await expect(
        page
          .getByRole('region', { name: 'Времена запуска по серверу (UTC+3)' })
          .getByRole('listitem'),
      ).toHaveCount(3)
      await page
        .getByRole('region', { name: 'Возможные награды' })
        .getByRole('link', { name: a.name, exact: true })
        .click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(a.name)
    }
    expect((await page.goto(`/events/${fixtures.name()}`))?.status()).toBe(404)
    const bad = await request.post('/api/public/events', { data: { coinsFrom: 10, coinsTo: 0 } })
    expect(bad.status()).toBe(400)
    await page.goto('/events')
    await page.route('**/api/public/events', (route) =>
      route.fulfill({ status: 500, body: 'unavailable' }),
    )
    await from.fill('1')
    await expect(page.locator('#main-content').getByRole('alert')).toHaveText(
      'Не удалось получить ивенты. Повторите попытку.',
    )
    await expect(page.getByText('Ивенты по выбранным условиям не найдены.')).toHaveCount(0)
    await page.unroute('**/api/public/events')
    for (const event of events)
      await api.update({
        collection: 'events',
        id: event.id,
        data: { coins: 5 },
        overrideAccess: true,
      })
    await page.goto('/events')
    await expect(page.getByText('Все ивенты дают 5 монет.')).toBeVisible()
    await expect(from).toBeDisabled()
    await page.getByRole('checkbox', { name: b.name, exact: true }).check()
    await expect(page.getByText('Найдено: 6', { exact: true })).toBeVisible()
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

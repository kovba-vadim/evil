import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'

test('event time admin shows related edit links and refreshes membership', async ({ page }) => {
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  try {
    const password = crypto.randomUUID()
    const user = await fixtures.create('users', {
      email: `${fixtures.name()}@example.test`,
      password,
    })
    const time = await fixtures.create('event-times', { time: '05:25', minutes: 0 })
    const events = []
    for (let index = 0; index < 3; index++) {
      events.push(
        await fixtures.create('events', {
          name: fixtures.name(),
          slug: fixtures.name(),
          launchTimes: [time.id],
          coins: 0,
          cooldownMinutes: 0,
        }),
      )
    }
    const login = await page.request.post('/api/users/login', {
      data: { email: user.email, password },
    })
    expect(login.ok()).toBe(true)
    await page.goto(`/admin/collections/event-times/${time.id}`)
    const block = page.getByRole('region', { name: 'Используется в ивентах' })
    await expect(block.getByRole('link')).toHaveCount(3)
    for (const event of events) {
      await expect(block.getByRole('link', { name: event.name })).toHaveAttribute(
        'href',
        `/admin/collections/events/${event.id}`,
      )
    }
    await block.getByRole('link', { name: events[0].name }).click()
    await expect(page).toHaveURL(`/admin/collections/events/${events[0].id}`)
    for (const event of events) {
      await api.update({
        collection: 'events',
        id: event.id,
        data: { launchTimes: [] },
        overrideAccess: true,
      })
    }
    await page.goto(`/admin/collections/event-times/${time.id}`)
    await expect(block).toContainText('Это время не используется в ивентах')
    await page.reload()
    await expect(block.getByRole('link')).toHaveCount(0)
    await page.goto('/admin/collections/event-times/create')
    await expect(block).toContainText('Сохраните время')
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

import { expect, test } from '@playwright/test'
import type { Event, Player } from '../../src/payload-types'
import { openTestPayload } from '../helpers/testDatabase'
import { reminderWriteCapability } from '../../src/access/player-reminders'

test('reminder dialog, independent settings and play mode across sessions with native API protection', async ({
  page,
  context,
  browser,
}) => {
  const api = await openTestPayload()
  const users: Player[] = [],
    events: Event[] = [],
    createdTimes: number[] = []
  const password = 'Reminders-browser-password-123'
  const origin = 'http://localhost:3101',
    endpoint = '/api/account/reminders'
  const reminderPattern = /\/api\/account\/reminders(?:\?.*)?$/
  const otherContext = await browser.newContext(),
    otherPage = await otherContext.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  async function login(target: typeof page, email: string) {
    await target.goto(`${origin}/login`)
    await target.getByLabel('Email', { exact: true }).fill(email)
    await target.getByLabel('Пароль', { exact: true }).fill(password)
    await target.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(target).toHaveURL(/\/account$/)
  }
  const snapshot = async () => await (await context.request.get(endpoint)).json()
  try {
    for (let i = 0; i < 2; i++)
      users.push(
        await api.create({
          collection: 'players',
          overrideAccess: true,
          disableVerificationEmail: true,
          data: {
            email: `reminder-browser-${crypto.randomUUID()}@example.test`,
            password,
            nickname: 'Напоминания',
            timeZone: 'Europe/London',
            _verified: true,
          },
        }),
      )
    const clocks: number[] = []
    for (const minutes of [45, 90]) {
      const time = new Date(Date.now() + minutes * 60_000 + 3 * 3_600_000)
        .toISOString()
        .slice(11, 16)
      let doc = (
        await api.find({
          collection: 'event-times',
          overrideAccess: true,
          where: { time: { equals: time } },
        })
      ).docs[0]
      if (!doc) {
        doc = await api.create({
          collection: 'event-times',
          overrideAccess: true,
          data: { time, minutes: 0 },
        })
        createdTimes.push(doc.id)
      }
      clocks.push(doc.id)
    }
    for (const launchTimes of [clocks, []])
      events.push(
        await api.create({
          collection: 'events',
          overrideAccess: true,
          data: {
            name: `Тест напоминаний ${crypto.randomUUID()}`,
            slug: `reminders-${crypto.randomUUID()}`,
            coins: 0,
            cooldownMinutes: 10,
            launchTimes,
          },
        }),
      )
    const event = events[0]
    await page.goto(`/events/${event.slug}`)
    await expect(
      page.getByRole('link', { name: 'Войдите, чтобы настроить напоминание' }),
    ).toHaveAttribute('href', `/login?returnTo=${encodeURIComponent(`/events/${event.slug}`)}`)
    await login(page, users[0].email)
    await page.goto(`/events/${event.slug}`)
    const panel = page.getByRole('region', { name: 'Напоминания об ивенте', exact: true })
    const trigger = panel.getByRole('button', { name: 'Напомнить', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Предупредить за', { exact: true })).toHaveValue('10')
    await expect(dialog.getByLabel('Показывать мой КД в уведомлении')).toBeChecked()
    await expect(dialog.locator('time')).toHaveCount(2)
    await expect(dialog.getByText('Часовой пояс:', { exact: false })).toContainText('Лондон')
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await trigger.click()
    await dialog.getByLabel('Предупредить за', { exact: true }).selectOption('custom')
    await dialog.getByLabel('Своё значение (минут)').fill('0')
    await expect(
      dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }),
    ).toBeDisabled()
    await dialog.getByLabel('Своё значение (минут)').fill('15')
    await dialog.getByLabel('Показывать мой КД в уведомлении').uncheck()
    await expect(dialog.locator('.player-reminders__preview')).not.toContainText('КД')
    await page.route(reminderPattern, async (route) => {
      if (route.request().method() === 'POST')
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Проверочная ошибка сохранения' }),
        })
      else await route.continue()
    })
    await dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Проверочная ошибка')
    expect((await snapshot()).reminders).toHaveLength(0)
    await page.unroute(reminderPattern)
    await dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(
      panel.getByText('Настройки сохранены. Отправка сообщений пока не подключена', {
        exact: true,
      }),
    ).toBeVisible()
    const once = (await snapshot()).reminders[0]
    await trigger.click()
    await dialog.getByLabel('Режим напоминания', { exact: true }).selectOption('regular')
    await expect(dialog.getByText('Ожидает включения «Я играю».', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect((await snapshot()).reminders).toHaveLength(2)
    expect((await snapshot()).play).toBeNull()
    await page.goto('/account')
    const play = page.getByRole('region', { name: 'Режим Я играю', exact: true })
    await expect(play.getByLabel('Включить на', { exact: true })).toHaveValue('4')
    await play.getByRole('button', { name: 'Включить «Я играю»', exact: true }).click()
    await expect(play.getByText('Режим включён.', { exact: false })).toBeVisible()
    const started = (await snapshot()).play
    await play.getByRole('button', { name: 'Продлить на 1 ч.', exact: true }).click()
    await expect(play.locator('time')).not.toHaveAttribute('dateTime', started.endsAt)
    const extended = (await snapshot()).play
    expect(Date.parse(extended.endsAt) - Date.parse(started.endsAt)).toBe(3_600_000)
    const retry = {
      action: 'play',
      operation: 'extend',
      hours: 2,
      revision: extended.revision,
      requestID: crypto.randomUUID(),
    }
    const first = await (
      await context.request.post(endpoint, { headers: { Origin: origin }, data: retry })
    ).json()
    const repeated = await (
      await context.request.post(endpoint, { headers: { Origin: origin }, data: retry })
    ).json()
    expect(repeated.play.endsAt).toBe(first.play.endsAt)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(play.locator('time')).toHaveAttribute('dateTime', first.play.endsAt)
    await login(otherPage, users[0].email)
    await expect(
      otherPage
        .getByRole('region', { name: 'Режим Я играю' })
        .getByText('Режим включён.', { exact: false }),
    ).toBeVisible()
    const beforeLogout = (await snapshot()).play.endsAt
    await page.getByRole('button', { name: 'Выйти', exact: true }).click()
    await login(page, users[0].email)
    expect((await snapshot()).play.endsAt).toBe(beforeLogout)
    const currentPlay = page.getByRole('region', { name: 'Режим Я играю', exact: true })
    await currentPlay.getByRole('button', { name: 'Выключить «Я играю»' }).click()
    await expect(currentPlay.getByRole('button', { name: 'Включить «Я играю»' })).toBeVisible()
    expect(
      (await snapshot()).reminders.find((row: { kind: string }) => row.kind === 'once').proposal,
    ).toEqual(once.proposal)
    const regular = page.getByRole('region', { name: 'Регулярные подписки', exact: true })
    await regular.getByRole('button', { name: 'Отключить подписку' }).click()
    await expect(regular.getByText('Подписка отключена')).toBeVisible()
    await regular.getByRole('button', { name: 'Изменить', exact: true }).click()
    await dialog.getByLabel('Предупредить за', { exact: true }).selectOption('5')
    await dialog.getByLabel('Показывать мой КД в уведомлении').uncheck()
    await dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(regular.getByText('За 5 мин.', { exact: false })).toBeVisible()
    const ownCookie = (await context.cookies()).find(
      (cookie) => cookie.name === 'evil-player-token',
    )!
    const raw = await context.request.get('/api/player-event-reminders?depth=0', {
      headers: { Authorization: `JWT ${ownCookie.value}` },
    })
    expect(raw.status()).toBe(200)
    expect(
      (await raw.json()).docs.every((row: { player: number }) => row.player === users[0].id),
    ).toBe(true)
    expect(
      (
        await context.request.patch(`/api/player-event-reminders/${once.id}`, {
          headers: { Authorization: `JWT ${ownCookie.value}` },
          data: { player: users[1].id, launchAt: new Date().toISOString() },
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await context.request.post(endpoint, {
          headers: { Origin: origin },
          data: { ...retry, playerID: users[1].id, endsAt: '2099-01-01' },
        })
      ).status(),
    ).toBe(400)
    await login(otherPage, users[1].email)
    await expect(otherPage.getByText('Разовых напоминаний нет.', { exact: true })).toBeVisible()
    const foreignCookie = (await otherContext.cookies()).find(
      (cookie) => cookie.name === 'evil-player-token',
    )!
    expect(
      (
        await otherContext.request.get(`${origin}/api/player-event-reminders/${once.id}`, {
          headers: { Authorization: `JWT ${foreignCookie.value}` },
        })
      ).status(),
    ).toBeGreaterThanOrEqual(400)
    await page.goto(`/events/${events[1].slug}`)
    await page.getByRole('button', { name: 'Напомнить', exact: true }).click()
    await expect(dialog.getByText('У ивента нет расписания:', { exact: false })).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }),
    ).toBeDisabled()
    await page.keyboard.press('Escape')
    await page.goto(`/events/${event.slug}`)
    await page.setViewportSize({ width: 375, height: 850 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.getByRole('button', { name: 'Напомнить', exact: true }).click()
    await expect(dialog.locator('time')).toHaveCount(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await dialog
      .getByRole('button', { name: 'Сохранить настройки', exact: true })
      .scrollIntoViewIfNeeded()
    await dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }).focus()
    await expect(
      dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }),
    ).toBeFocused()
    await expect(
      dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }),
    ).toBeVisible()
    await page.screenshot({ path: 'test-results/reminder-dialog-mobile.png', fullPage: true })
    await page.keyboard.press('Escape')
    await page.goto('/account')
    for (const name of ['Разовые напоминания', 'Регулярные подписки']) {
      const section = page.getByRole('region', { name, exact: true })
      await section.getByRole('button', { name: 'Удалить', exact: true }).click()
      await section.getByRole('button', { name: 'Да, удалить', exact: true }).click()
      await expect(section.getByRole('listitem')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  } finally {
    await otherContext.close()
    if (users.length)
      for (const collection of ['player-event-reminders', 'player-play-sessions'] as const)
        await api.delete({
          collection,
          overrideAccess: true,
          context: { reminderWrite: reminderWriteCapability },
          where: { player: { in: users.map((user) => user.id) } },
        })
    for (const event of events)
      await api.delete({ collection: 'events', id: event.id, overrideAccess: true })
    for (const id of createdTimes)
      await api.delete({ collection: 'event-times', id, overrideAccess: true })
    for (const user of users)
      await api.delete({ collection: 'players', id: user.id, overrideAccess: true })
    await api.destroy()
  }
})

import { expect, test, type Locator } from '@playwright/test'
import type { Event, Player } from '../../src/payload-types'
import { openTestPayload } from '../helpers/testDatabase'
import { reminderWriteCapability } from '../../src/access/player-reminders'

test('regular subscriptions and play mode across sessions with native API protection', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(120_000)
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
    await target.goto(`${origin}/login?returnTo=%2Faccount%2Freminders`)
    await target.getByLabel('Email', { exact: true }).fill(email)
    await target.getByLabel('Пароль', { exact: true }).fill(password)
    await target.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(target).toHaveURL(/\/account\/reminders$/, { timeout: 20_000 })
  }
  const snapshot = async () => await (await context.request.get(endpoint)).json()
  const gamepadOff = page.locator('header').getByRole('button', { name: 'Я играю — выключено' })
  const gamepadOn = page.locator('header').getByRole('button', { name: 'Я играю — включено' })
  async function expectCompactSubscriptionActions(scope: Locator) {
    const viewport = page.viewportSize()!
    try {
      for (const width of [320, 425]) {
        await page.setViewportSize({ width, height: 850 })
        await expect(page.locator('[data-slot="sidebar-gap"]')).toHaveCSS('width', '48px')
        const header = scope.locator('.player-reminders__item-header')
        const actions = header.getByRole('button')
        await expect(scope.getByRole('button')).toHaveCount(3)
        await expect(actions).toHaveCount(3)
        await expect(actions.first().locator('svg')).toHaveClass(/lucide-pencil/)
        await expect(actions.nth(1).locator('svg')).toHaveClass(/lucide-bell-(ring|off)/)
        await expect(actions.last().locator('svg')).toHaveClass(/\blucide-trash(?:-2)?\b/)
        for (const button of await actions.all()) {
          await expect(button).toHaveAttribute('data-size', 'icon-lg')
          await expect(button).toHaveText('')
        }
        const title = (await header.getByRole('link').boundingBox())!
        const first = (await actions.first().boundingBox())!
        const last = (await actions.last().boundingBox())!
        expect(title.x + title.width).toBeLessThan(first.x)
        expect(first.y).toBe(last.y)
        expect(last.x + last.width).toBeLessThanOrEqual(width)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        )
      }
    } finally {
      await page.setViewportSize(viewport)
    }
  }
  async function expectCompactPlayActions(scope: Locator) {
    const viewport = page.viewportSize()!
    await page.setViewportSize({ width: 320, height: viewport.height })
    try {
      await expect(page.locator('[data-slot="sidebar-gap"]')).toHaveCSS('width', '48px')
      const extend = scope.getByRole('button', { name: 'Продлить на 1 ч.', exact: true })
      const stop = scope.getByRole('button', { name: 'Выключить', exact: true })
      await expect(extend).toBeVisible()
      await expect(stop).toBeVisible()
      await expect(scope.getByRole('button', { name: 'Продлить на 2 ч.' })).toHaveCount(0)
      const left = (await extend.boundingBox())!
      const right = (await stop.boundingBox())!
      const container = (await scope.boundingBox())!
      expect(left.y).toBeCloseTo(right.y, 0)
      expect(left.width).toBeCloseTo(right.width, 0)
      expect(left.x + left.width).toBeLessThan(right.x)
      expect(left.x).toBeGreaterThanOrEqual(container.x)
      expect(right.x + right.width).toBeLessThanOrEqual(
        Math.min(320, container.x + container.width),
      )
    } finally {
      await page.setViewportSize(viewport)
    }
  }
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
            name: `Тест напоминаний ${'Длинноеназваниеивента'.repeat(3)} ${crypto.randomUUID()}`,
            slug: `reminders-${crypto.randomUUID()}`,
            coins: 0,
            durationMinutes: 30,
            cooldownMinutes: 10,
            launchTimes,
          },
        }),
      )
    const event = events[0]
    await test.step('guest bells open the account dialog without reminder requests', async () => {
      const requests: string[] = []
      const onRequest = (request: { url(): string }) => {
        if (reminderPattern.test(request.url())) requests.push(request.url())
      }
      page.on('request', onRequest)
      try {
        for (const path of ['/events', '/event-launches']) {
          await page.goto(path)
          const bells = page.getByRole('button', { name: /^Настроить напоминание: / })
          const bell = page
            .getByRole('button', { name: `Настроить напоминание: ${event.name}`, exact: true })
            .first()
          await expect(bell).toBeVisible()
          for (const width of [320, 375, 425, 1440]) {
            await page.setViewportSize({ width, height: 900 })
            await expect(page.locator('[data-slot="sidebar-gap"]')).toHaveCSS(
              'width',
              width < 1024 ? '48px' : '256px',
            )
            await expect(gamepadOff.locator('svg')).toHaveClass(/lucide-gamepad/)
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth),
            ).toBeLessThanOrEqual(width)
            const fits = await bells.evaluateAll((buttons) =>
              buttons.every((button) => {
                const row = button.parentElement!
                const link = row.querySelector('a')!.getBoundingClientRect()
                const bounds = button.getBoundingClientRect()
                return (
                  Math.abs(row.getBoundingClientRect().right - bounds.right) < 1 &&
                  link.right <= bounds.left &&
                  bounds.width >= 40 &&
                  bounds.height >= 40
                )
              }),
            )
            expect(fits, `${path} at ${width}px`).toBe(true)
          }
          await page.setViewportSize({ width: 320, height: 900 })
          await expect(page.locator('[data-slot="sidebar-gap"]')).toHaveCSS('width', '48px')
          await gamepadOff.press('Enter')
          const guestPlay = page.getByRole('dialog', { name: 'Режим «Я играю»' })
          await expect(guestPlay.locator('p').first()).toHaveText(
            'Зарегистрируйтесь или войдите, чтобы включить игровой режим и получать напоминания о запуске ивентов и завершении КД на ивенты и квесты.',
          )
          await expect(guestPlay.locator('p').nth(1)).toHaveText(
            'Уведомления можно будет получать в Telegram или Discord.',
          )
          const verifyLinks = async (modal: Locator) => {
            const description = modal.locator('p').first()
            const register = description.getByRole('link', {
              name: 'Зарегистрируйтесь',
              exact: true,
            })
            const login = description.getByRole('link', { name: 'войдите', exact: true })
            await expect(register).toHaveAttribute('href', '/register')
            await expect(login).toHaveAttribute(
              'href',
              `/login?returnTo=${encodeURIComponent(path)}`,
            )
            await expect(register).toBeFocused()
            await page.keyboard.press('Tab')
            await expect(login).toBeFocused()
            await expect(modal.getByRole('button')).toHaveCount(1)
            expect(
              await modal.evaluate((element) => element.scrollWidth <= element.clientWidth),
            ).toBe(true)
          }
          await verifyLinks(guestPlay)
          await guestPlay.getByRole('button', { name: 'Закрыть режим «Я играю»' }).click()
          await expect(gamepadOff).toBeFocused()
          await bell.press('Enter')
          const guestDialog = page.getByRole('dialog', { name: 'Напоминания об ивентах' })
          await expect(guestDialog.locator('p')).toHaveText(
            'Зарегистрируйтесь или войдите, чтобы получать напоминания о запусках ивентов.',
          )
          await verifyLinks(guestDialog)
          await expect(page).toHaveURL(path)
          await page.keyboard.press('Escape')
          await expect(bell).toBeFocused()
        }
        expect(requests).toEqual([])
      } finally {
        page.off('request', onRequest)
      }
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/events/${event.slug}`)
    await expect(
      page.getByRole('link', { name: 'Войдите, чтобы настроить напоминание' }),
    ).toHaveAttribute('href', `/login?returnTo=${encodeURIComponent(`/events/${event.slug}`)}`)
    await gamepadOff.press('Enter')
    await page
      .getByRole('dialog', { name: 'Режим «Я играю»' })
      .getByRole('link', { name: 'войдите', exact: true })
      .press('Enter')
    await expect(page).toHaveURL(/\/login\?returnTo=/)
    await page.getByLabel('Email', { exact: true }).fill(users[0].email)
    await page.getByLabel('Пароль', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(page).toHaveURL(`/events/${event.slug}`, { timeout: 20_000 })
    const panel = page.getByRole('region', { name: 'Напоминания об ивенте', exact: true })
    const trigger = panel.getByRole('button', { name: 'Напомнить', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Внимание!', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/Отправка сообщений пока не подключена/)).toBeVisible()
    await expect(dialog.getByLabel('Предупредить за', { exact: true })).toHaveValue('10')
    await expect(dialog.getByLabel('Показывать мой КД в уведомлении')).toBeChecked()
    await expect(dialog.getByText('Ожидает включения «Я играю».', { exact: true })).toBeVisible()
    await expect(dialog.locator('time')).toHaveCount(0)
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
    await expect(dialog.getByLabel('Режим напоминания')).toHaveCount(0)
    await expect(dialog.locator('.player-reminders__preview')).toHaveCount(0)
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
    const subscription = (await snapshot()).reminders[0]
    expect(subscription).toMatchObject({
      kind: 'regular',
      leadMinutes: 15,
      includeCooldown: false,
      proposal: null,
    })
    expect((await snapshot()).reminders).toHaveLength(1)
    expect((await snapshot()).play).toBeNull()
    await expect(trigger).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Разовые напоминания' })).toHaveCount(0)
    expect(
      (
        await context.request.post(endpoint, {
          headers: { Origin: origin },
          data: {
            action: 'save',
            kind: 'once',
            eventID: event.id,
            leadMinutes: 10,
            enabled: true,
            includeCooldown: true,
            launchAt: new Date().toISOString(),
            revision: null,
            requestID: crypto.randomUUID(),
          },
        })
      ).status(),
    ).toBe(400)
    await page.goto('/account/reminders')
    const play = page.getByRole('region', { name: 'Режим Я играю', exact: true })
    await expect(play.getByLabel('Включить на', { exact: true })).toHaveValue('4')
    await gamepadOff.press('Enter')
    const headerManager = page.getByRole('dialog', { name: 'Я играю', exact: true })
    await expect(headerManager.getByLabel('Включить на')).toHaveValue('4')
    await expect(headerManager.getByLabel('Включить на').locator('option')).toHaveText([
      '2 часа',
      '4 часа',
      '6 часа',
    ])
    expect((await snapshot()).play).toBeNull()
    const startFromHeader = headerManager.getByRole('button', {
      name: 'Включить «Я играю»',
      exact: true,
    })
    let headerWrites = 0
    await page.route(reminderPattern, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      headerWrites++
      await route.fulfill({ status: 500, json: { message: 'Проверочная ошибка игрового периода' } })
    })
    try {
      await startFromHeader.evaluate((button: HTMLButtonElement) => {
        button.click()
        button.click()
      })
      await expect(headerManager.getByRole('alert')).toHaveText(
        'Проверочная ошибка игрового периода',
      )
      expect(headerWrites).toBe(1)
    } finally {
      await page.unroute(reminderPattern)
    }
    await startFromHeader.click()
    await expect(
      headerManager.getByRole('button', { name: 'Выключить', exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(gamepadOn).toBeFocused()
    await expect(play.getByText('Режим включён.', { exact: false })).toBeVisible()
    await expectCompactPlayActions(play)
    const started = (await snapshot()).play
    await gamepadOn.press('Enter')
    await headerManager.getByRole('button', { name: 'Продлить на 1 ч.', exact: true }).click()
    await expect(headerManager.locator('time')).not.toHaveAttribute('datetime', started.endsAt)
    await page.keyboard.press('Escape')
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
    await page.getByRole('button', { name: 'Меню игрока', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Выйти', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(gamepadOff).toBeVisible()
    await login(page, users[0].email)
    expect((await snapshot()).play.endsAt).toBe(beforeLogout)
    const currentPlay = page.getByRole('region', { name: 'Режим Я играю', exact: true })
    await gamepadOn.press('Enter')
    await headerManager.getByRole('button', { name: 'Выключить', exact: true }).click()
    await expect(headerManager.getByRole('button', { name: 'Включить «Я играю»' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(currentPlay.getByRole('button', { name: 'Включить «Я играю»' })).toBeVisible()
    await expect(gamepadOff).toBeVisible()
    expect((await snapshot()).reminders).toHaveLength(1)
    expect((await snapshot()).reminders[0]).toMatchObject({
      id: subscription.id,
      proposal: null,
      status: 'waiting',
    })
    const regular = page.getByRole('region', { name: 'Регулярные подписки', exact: true })
    await expectCompactSubscriptionActions(regular)
    await regular.getByRole('button', { name: 'Отключить подписку' }).click()
    await expect(regular.getByText('Подписка отключена')).toBeVisible()
    const accountEnable = regular.getByRole('button', { name: 'Включить подписку', exact: true })
    await expect(accountEnable).toHaveClass(/text-destructive/)
    await expect(accountEnable.locator('svg')).toHaveClass(/lucide-bell-off/)
    await regular.getByRole('button', { name: 'Изменить подписку', exact: true }).press('Enter')
    await dialog.getByLabel('Предупредить за', { exact: true }).selectOption('5')
    await dialog.getByLabel('Показывать мой КД в уведомлении').uncheck()
    await dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(regular.getByText('За 5 мин.', { exact: false })).toBeVisible()
    await accountEnable.press('Enter')
    const accountDisable = regular.getByRole('button', { name: 'Отключить подписку', exact: true })
    await expect(accountDisable).toHaveClass(/text-green-700/)
    await expect(accountDisable.locator('svg')).toHaveClass(/lucide-bell-ring/)
    await expect(regular.getByText('За 5 мин.', { exact: false })).toBeVisible()
    await accountDisable.click()
    await expect(accountEnable).toBeEnabled()
    await regular.getByRole('button', { name: 'Удалить подписку', exact: true }).press('Enter')
    await expect(page.getByRole('alertdialog', { name: 'Удалить подписку?' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(regular.getByRole('listitem')).toHaveCount(1)
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
        await context.request.patch(`/api/player-event-reminders/${subscription.id}`, {
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
    await expect(otherPage.getByText('Регулярных подписок нет.', { exact: true })).toBeVisible()
    const foreignCookie = (await otherContext.cookies()).find(
      (cookie) => cookie.name === 'evil-player-token',
    )!
    expect(
      (
        await otherContext.request.get(`${origin}/api/player-event-reminders/${subscription.id}`, {
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
    const eventRegular = page.getByRole('region', { name: 'Регулярные подписки', exact: true })
    const editSubscription = eventRegular.getByRole('button', { name: 'Изменить подписку' })
    const deleteSubscription = eventRegular.getByRole('button', { name: 'Удалить подписку' })
    await expectCompactSubscriptionActions(eventRegular)
    for (const [width, colorScheme] of [
      [320, 'light'],
      [430, 'dark'],
    ] as const) {
      await page.setViewportSize({ width, height: 850 })
      await page.emulateMedia({ colorScheme })
      const actions = eventRegular.getByRole('button')
      await expect(actions).toHaveCount(3)
      for (const button of await actions.all()) {
        await expect(button).toHaveAttribute('data-size', 'icon-lg')
        await expect(button.locator('svg')).toHaveCount(1)
        await expect(button).toHaveText('')
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    const enable = eventRegular.getByRole('button', { name: 'Включить подписку' })
    await expect(enable.locator('svg')).toHaveClass(/lucide-bell-off/)
    await enable.click()
    const disable = eventRegular.getByRole('button', { name: 'Отключить подписку' })
    await expect(disable.locator('svg')).toHaveClass(/lucide-bell-ring/)
    await disable.click()
    await expect(enable).toBeVisible()
    await editSubscription.focus()
    await page.keyboard.press('Enter')
    await expect(dialog.getByLabel('Предупредить за')).toHaveValue('5')
    await expect(dialog.getByRole('button', { name: '«Я играю»', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    const confirmation = page.getByRole('alertdialog', { name: 'Удалить подписку?' })
    await deleteSubscription.click()
    await expect(confirmation).toContainText(event.name)
    await expect(confirmation.getByRole('button', { name: 'Отмена' })).toBeFocused()
    await confirmation.getByRole('button', { name: 'Отмена' }).click()
    await expect(deleteSubscription).toBeVisible()
    await deleteSubscription.click()
    await page.keyboard.press('Escape')
    await expect(confirmation).toHaveCount(0)
    await expect(deleteSubscription).toBeVisible()
    await page.goto('/account/reminders')
    await regular.getByRole('button', { name: 'Удалить подписку', exact: true }).click()
    await confirmation.getByRole('button', { name: 'Удалить', exact: true }).click()
    await expect(regular.getByRole('listitem')).toHaveCount(0)
    await page.goto(`/events/${event.slug}`)
    await expect(eventRegular.getByRole('listitem')).toHaveCount(0)
    await page.setViewportSize({ width: 375, height: 850 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.getByRole('button', { name: 'Напомнить', exact: true }).click()
    await expect(dialog.getByText('Ожидает включения «Я играю».', { exact: true })).toBeVisible()
    await expect(dialog.locator('time')).toHaveCount(0)
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
    await test.step('play period dialog preserves subscription draft and shares account state', async () => {
      const playLink = dialog.getByRole('button', { name: '«Я играю»', exact: true })
      await dialog.getByLabel('Предупредить за').selectOption('15')
      await dialog.getByLabel('Показывать мой КД в уведомлении').uncheck()
      await playLink.press('Enter')
      const manager = page.getByRole('dialog', { name: 'Я играю', exact: true })
      const startMode = manager.getByRole('button', { name: 'Включить «Я играю»', exact: true })
      const stopMode = manager.getByRole('button', { name: 'Выключить', exact: true })
      await expect(startMode).toBeVisible()
      for (const hours of [2, 4, 6]) {
        await manager.getByLabel('Включить на').selectOption(String(hours))
        await startMode.click()
        await expect(stopMode).toBeVisible()
        const period = (await snapshot()).play
        expect(Date.parse(period.endsAt) - Date.parse(period.startedAt)).toBe(hours * 3_600_000)
        await expect(manager.locator('time')).toHaveAttribute('datetime', period.endsAt)
        if (hours === 2) {
          await expectCompactPlayActions(manager)
          const extend = manager.getByRole('button', { name: 'Продлить на 1 ч.' })
          await page.route(reminderPattern, async (route) => {
            if (route.request().method() !== 'POST') return route.continue()
            await route.fulfill({ status: 500, json: { message: 'Ошибка продления' } })
          })
          try {
            await extend.click()
            await expect(manager.getByRole('alert')).toHaveText('Ошибка продления')
            await expect(manager.locator('time')).toHaveAttribute('datetime', period.endsAt)
          } finally {
            await page.unroute(reminderPattern)
          }
          await extend.click()
          await expect(manager.locator('time')).not.toHaveAttribute('datetime', period.endsAt)
          await expect(manager.getByText(/Осталось:/)).toBeVisible()
        }
        if (hours !== 6) {
          await stopMode.click()
          await expect(startMode).toBeVisible()
        }
      }
      const period = (await snapshot()).play
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.keyboard.press('Escape')
      await expect(manager).not.toBeVisible()
      await expect(playLink).toBeFocused()
      await expect(dialog.getByLabel('Предупредить за')).toHaveValue('15')
      await expect(dialog.getByLabel('Показывать мой КД в уведомлении')).not.toBeChecked()
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(gamepadOn).toBeVisible()
      await page.goto('/account/reminders')
      await expect(play.locator('time')).toHaveAttribute('datetime', period.endsAt)
      await play.getByRole('button', { name: 'Выключить', exact: true }).click()
      await expect(play.getByText(/Режим выключен/)).toBeVisible()
      await page.goto(`/events/${event.slug}`)
      await trigger.click()
      await page.route(reminderPattern, (route) => {
        if (route.request().method() === 'GET' && new URL(route.request().url()).search === '')
          return route.fulfill({ status: 401 })
        return route.continue()
      })
      try {
        await playLink.click()
        await expect(panel.getByText(/Сессия изменилась/)).toBeVisible()
        await expect(manager).not.toBeVisible()
      } finally {
        await page.unroute(reminderPattern)
      }
    })
    await page.keyboard.press('Escape')
    await page.goto('/account/reminders')
    await expect(page.getByText('Регулярных подписок нет.', { exact: true })).toBeVisible()
    await test.step('catalog bells save and synchronize regular subscriptions', async () => {
      const playBefore = (await snapshot()).play
      const bell = (action: string) =>
        page.getByRole('button', { name: `${action}: ${event.name}`, exact: true })
      const enable = bell('Включить подписку')
      const disable = bell('Отключить подписку')
      await page.goto('/events')
      await bell('Настроить напоминание').click()
      await expect(page).toHaveURL('/events')
      await dialog.getByLabel('Предупредить за', { exact: true }).selectOption('custom')
      await dialog.getByLabel('Своё значение (минут)').fill('121')
      const save = dialog.getByRole('button', { name: 'Сохранить настройки' })
      await expect(save).toBeDisabled()
      await dialog.getByLabel('Своё значение (минут)').fill('17')
      await dialog.getByLabel('Показывать мой КД в уведомлении').uncheck()
      await save.click()
      await expect(dialog).not.toBeVisible()
      await expect(disable).toBeFocused()
      const original = (await snapshot()).reminders.find(
        (row: { eventID: number }) => row.eventID === event.id,
      )
      expect(original).toMatchObject({ leadMinutes: 17, includeCooldown: false, enabled: true })

      await page.goto('/event-launches')
      await expect(disable).toHaveCount(2)
      await expect(page.locator('html')).toHaveClass(/\bdark\b/)
      let posts = 0
      await page.route(reminderPattern, async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        posts++
        await route.fulfill({
          status: 500,
          json: { message: 'Не удалось обновить подписку. Проверочная ошибка.' },
        })
      })
      await disable.first().evaluate((button: HTMLButtonElement) => {
        button.click()
        button.click()
      })
      await expect(page.locator('#main-content').getByRole('alert')).toContainText(
        'Проверочная ошибка',
      )
      expect(posts).toBe(1)
      await expect(disable).toHaveCount(2)
      await page.unroute(reminderPattern)
      await disable.first().click()
      await expect(enable).toHaveCount(2)
      await enable.last().press('Enter')
      await expect(disable).toHaveCount(2)
      await expect(page).toHaveURL('/event-launches')
      await page.setViewportSize({ width: 320, height: 800 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      const after = await snapshot()
      expect(after.reminders).toHaveLength(1)
      expect(after.reminders[0]).toMatchObject({
        id: original.id,
        leadMinutes: 17,
        includeCooldown: false,
        enabled: true,
      })
      expect(after.play).toEqual(playBefore)
      await page.getByRole('link', { name: event.name, exact: true }).first().click()
      await expect(page).toHaveURL(`/events/${event.slug}`)
      await page.goto('/events')
      await expect(disable).toBeEnabled()
      await context.clearCookies()
      await disable.click()
      await expect(page.locator('#main-content').getByRole('alert')).toContainText('Войдите заново')
      await bell('Настроить напоминание').click()
      await expect(page.getByRole('dialog', { name: 'Напоминания об ивентах' })).toBeVisible()
    })
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

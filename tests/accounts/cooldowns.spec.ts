import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { cooldownWriteCapability } from '../../src/access/player-cooldowns'
import type { Event, Player } from '../../src/payload-types'

test('personal cooldown lifecycle persists across sessions and devices with private API access', async ({
  page,
  context,
  browser,
}) => {
  const api = await openTestPayload()
  const password = 'Cooldown-password-12345'
  const email = `cooldown-${crypto.randomUUID()}@example.test`
  const otherEmail = `cooldown-other-${crypto.randomUUID()}@example.test`
  const users: Player[] = []
  const events: Event[] = []
  const capability = { cooldownWrite: cooldownWriteCapability }
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const secondContext = await browser.newContext()
  const second = await secondContext.newPage()
  async function login(target: typeof page, email: string) {
    await target.goto('http://localhost:3101/login?returnTo=%2Faccount%2Fcooldowns')
    await target.getByLabel('Email', { exact: true }).fill(email)
    await target.getByLabel('Пароль', { exact: true }).fill(password)
    await target.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(target).toHaveURL(/\/account\/cooldowns$/, { timeout: 20_000 })
  }
  try {
    for (const address of [email, otherEmail])
      users.push(
        await api.create({
          collection: 'players',
          overrideAccess: true,
          disableVerificationEmail: true,
          data: {
            email: address,
            password,
            nickname: 'КД игрок',
            timeZone: 'Europe/London',
            _verified: true,
          },
        }),
      )
    for (const minutes of [60, 0])
      events.push(
        await api.create({
          collection: 'events',
          overrideAccess: true,
          data: {
            name: `Личный КД ${crypto.randomUUID()}`,
            slug: `personal-${crypto.randomUUID()}`,
            coins: 0,
            durationMinutes: 30, cooldownMinutes: minutes,
          },
        }),
      )
    const event = events[0]
    await page.goto(`/events/${event.slug}`)
    const loginLink = page.getByRole('link', { name: 'Войдите', exact: true })
    await expect(loginLink).toHaveAttribute(
      'href',
      `/login?returnTo=${encodeURIComponent(`/events/${event.slug}`)}`,
    )
    await login(page, email)
    await expect(page.getByText('Активных личных КД нет.')).toBeVisible()
    await page.goto(`/events/${event.slug}`)
    const panel = page.getByRole('region', { name: 'Мой КД ивента', exact: true })
    await panel.getByRole('button', { name: 'Прошёл', exact: true }).click()
    await expect(panel.getByText('Осталось:', { exact: false })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Прошёл', exact: true })).toHaveCount(0)
    await expect(panel.locator('time')).toContainText('UTC+0')
    const endpoint = '/api/account/cooldowns'
    const origin = 'http://localhost:3101'
    const personalResponse = await context.request.get(endpoint)
    expect(personalResponse.headers()['cache-control']).toContain('private, no-store')
    expect(personalResponse.headers()['vary'].split(/,\s*/)).toContain('Cookie')
    expect(
      (
        await context.request.post(endpoint, {
          headers: { Origin: 'https://external.test' },
          data: {},
        })
      ).status(),
    ).toBe(403)
    const current = (await (await context.request.get(`${endpoint}?eventID=${event.id}`)).json())
      .records[0]
    const replay = await context.request.post(endpoint, {
      headers: { Origin: origin },
      data: {
        action: 'complete',
        eventID: event.id,
        requestID: crypto.randomUUID(),
        previousRevision: null,
      },
    })
    expect((await replay.json()).records[0].cooldownUntil).toBe(current.cooldownUntil)
    expect(
      (
        await context.request.post(endpoint, {
          headers: { Origin: origin },
          data: {
            action: 'complete',
            eventID: event.id,
            playerID: users[1].id,
            cooldownMinutes: 1,
            requestID: crypto.randomUUID(),
            previousRevision: null,
          },
        })
      ).status(),
    ).toBe(400)
    const cookie = (await context.cookies()).find((cookie) => cookie.name === 'evil-player-token')!
    const auth = { Authorization: `JWT ${cookie.value}` }
    const native = await context.request.get('/api/player-event-cooldowns?depth=0', {
      headers: auth,
    })
    expect(native.status()).toBe(200)
    expect(
      (await native.json()).docs.every((doc: { player: number }) => doc.player === users[0].id),
    ).toBe(true)
    expect(
      (
        await context.request.patch(`/api/player-event-cooldowns/${current.id}`, {
          headers: auth,
          data: { player: users[1].id },
        })
      ).status(),
    ).toBe(403)
    await login(second, otherEmail)
    await expect(second.getByText('Активных личных КД нет.')).toBeVisible()
    const otherCookie = (await secondContext.cookies()).find(
      (cookie) => cookie.name === 'evil-player-token',
    )!
    expect(
      (
        await secondContext.request.get(
          `http://localhost:3101/api/player-event-cooldowns/${current.id}`,
          { headers: { Authorization: `JWT ${otherCookie.value}` } },
        )
      ).status(),
    ).toBeGreaterThanOrEqual(400)
    await page.goto('/account/cooldowns')
    await expect(
      page
        .getByRole('region', { name: 'Мои КД', exact: true })
        .getByRole('link', { name: event.name }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Меню игрока', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Выйти', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await login(page, email)
    expect((await (await context.request.get(endpoint)).json()).records[0].cooldownUntil).toBe(
      current.cooldownUntil,
    )
    await login(second, email)
    await page.getByRole('button', { name: 'Отменить отметку', exact: true }).click()
    await expect(page.getByRole('group', { name: 'Подтверждение отмены' })).toBeVisible()
    await page.getByRole('button', { name: 'Да, отменить', exact: true }).click()
    await expect(page.getByText('Активных личных КД нет.')).toBeVisible()
    await second.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(second.getByText('Активных личных КД нет.')).toBeVisible()
    await page.goto(`/events/${event.slug}`)
    await page.getByRole('button', { name: 'Прошёл', exact: true }).click()
    await expect(
      page
        .getByRole('region', { name: 'Мой КД ивента', exact: true })
        .getByText('Осталось:', { exact: false }),
    ).toBeVisible()
    const again = (await (await context.request.get(`${endpoint}?eventID=${event.id}`)).json())
      .records[0]
    await api.update({
      collection: 'player-event-cooldowns',
      id: again.id,
      overrideAccess: true,
      context: capability,
      data: { cooldownUntil: new Date(Date.now() + 2500).toISOString() },
    })
    await page.goto('/account/cooldowns')
    await expect(page.getByText('Активных личных КД нет.')).toBeVisible({ timeout: 8000 })
    await page.goto(`/events/${event.slug}`)
    await expect(page.getByText('КД закончился.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Прошёл', exact: true })).toBeVisible()
    await page.goto(`/events/${events[1].slug}`)
    await page.getByRole('button', { name: 'Прошёл', exact: true }).click()
    await expect(page.getByText('Прохождение сохранено. У ивента нет личного КД.')).toBeVisible()
    await page.setViewportSize({ width: 375, height: 850 })
    await expect(page.locator('[data-slot="sidebar-gap"]')).toHaveCSS('width', '48px')
    await page.emulateMedia({ colorScheme: 'dark' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/cooldowns-mobile.png', fullPage: true })
    expect(errors).toEqual([])
  } finally {
    await secondContext.close()
    if (users.length)
      await api.delete({
        collection: 'player-event-cooldowns',
        overrideAccess: true,
        context: capability,
        where: { player: { in: users.map((doc) => doc.id) } },
      })
    for (const event of events)
      await api.delete({ collection: 'events', id: event.id, overrideAccess: true })
    for (const user of users)
      await api.delete({ collection: 'players', id: user.id, overrideAccess: true })
    await api.destroy()
  }
})

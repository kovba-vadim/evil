import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { cooldownWriteCapability } from '../../src/access/player-cooldowns'
import { reminderWriteCapability } from '../../src/access/player-reminders'
import type { Event, Player } from '../../src/payload-types'

test('duration and current cooldown filter launches independently from the text checkbox', async ({
  page,
  context,
}) => {
  const api = await openTestPayload()
  let actor: Player | undefined, event: Event | undefined
  const ownTimes: number[] = [],
    timeIDs: number[] = []
  const password = 'Duration-browser-password-123'
  try {
    actor = await api.create({
      collection: 'players',
      overrideAccess: true,
      disableVerificationEmail: true,
      data: {
        email: `duration-${crypto.randomUUID()}@example.test`,
        password,
        nickname: 'Длительность',
        timeZone: 'Europe/London',
        _verified: true,
      },
    })
    for (const minutes of [12, 55]) {
      const time = new Date(Date.now() + (minutes + 180) * 60_000).toISOString().slice(11, 16)
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
        ownTimes.push(doc.id)
      }
      timeIDs.push(doc.id)
    }
    event = await api.create({
      collection: 'events',
      overrideAccess: true,
      data: {
        name: `Длительность ${crypto.randomUUID()}`,
        slug: `duration-${crypto.randomUUID()}`,
        coins: 0,
        cooldownMinutes: 45,
        durationMinutes: 30,
        launchTimes: timeIDs,
      },
    })
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(actor.email)
    await page.getByLabel('Пароль', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(page).toHaveURL(/\/account$/, { timeout: 20_000 })
    await page.goto('/account/reminders')
    await page.getByRole('button', { name: 'Включить «Я играю»', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Выключить', exact: true })).toBeVisible()
    await page.goto(`/events/${event.slug}`)
    const reminders = page.getByRole('region', { name: 'Напоминания об ивенте', exact: true })
    const regular = reminders.getByRole('region', { name: 'Регулярные подписки', exact: true })
    const cooldown = page.getByRole('region', { name: 'Мой КД ивента', exact: true })
    const dialog = page.getByRole('dialog')
    await reminders.getByRole('button', { name: 'Напомнить', exact: true }).click()
    await dialog.getByLabel('Предупредить за', { exact: true }).selectOption('5')
    await dialog.getByLabel('Показывать мой КД в уведомлении').uncheck()
    await expect(dialog.locator('time')).toHaveCount(2)
    const original = await dialog.locator('time').first().getAttribute('datetime')
    await dialog.getByRole('button', { name: 'Сохранить настройки', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    const launch = regular.locator('time').first()
    await expect(launch).toHaveAttribute('datetime', original!)
    await cooldown.getByRole('button', { name: 'Прошёл', exact: true }).click()
    await expect(launch).not.toHaveAttribute('datetime', original!)
    const next = await launch.getAttribute('datetime')
    expect(Date.parse(next!)).toBeGreaterThan(Date.parse(original!))
    await cooldown.getByRole('button', { name: 'Отменить отметку', exact: true }).click()
    await cooldown.getByRole('button', { name: 'Да, отменить', exact: true }).click()
    await expect(launch).toHaveAttribute('datetime', original!)
    await cooldown.getByRole('button', { name: 'Прошёл', exact: true }).click()
    await expect(launch).toHaveAttribute('datetime', next!)
    await api.update({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
      data: { durationMinutes: 60 },
    })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(launch).toHaveAttribute('datetime', original!)
    const cookie = (await context.cookies()).find((value) => value.name === 'evil-player-token')!
    expect(
      (
        await context.request.patch(`/api/events/${event.id}`, {
          headers: { Authorization: `JWT ${cookie.value}` },
          data: { durationMinutes: 120 },
        })
      ).status(),
    ).toBe(403)
    await page.setViewportSize({ width: 375, height: 850 })
    await expect(page.locator('[data-slot="sidebar-gap"]')).toHaveCSS('width', '48px')
    await page.emulateMedia({ colorScheme: 'dark' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/event-duration-mobile.png', fullPage: true })
  } finally {
    if (actor) {
      await api.delete({
        collection: 'player-play-sessions',
        overrideAccess: true,
        context: { reminderWrite: reminderWriteCapability },
        where: { player: { equals: actor.id } },
      })
      await api.delete({
        collection: 'player-event-reminders',
        overrideAccess: true,
        context: { reminderWrite: reminderWriteCapability },
        where: { player: { equals: actor.id } },
      })
      await api.delete({
        collection: 'player-event-cooldowns',
        overrideAccess: true,
        context: { cooldownWrite: cooldownWriteCapability },
        where: { player: { equals: actor.id } },
      })
    }
    if (event) await api.delete({ collection: 'events', id: event.id, overrideAccess: true })
    for (const id of ownTimes)
      await api.delete({ collection: 'event-times', id, overrideAccess: true })
    if (actor) await api.delete({ collection: 'players', id: actor.id, overrideAccess: true })
    await api.destroy()
  }
})

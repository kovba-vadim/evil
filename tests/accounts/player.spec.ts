import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'

test('development account lifecycle, server protection and responsive forms', async ({
  page,
  context,
}) => {
  const api = await openTestPayload()
  const email = `browser-long-${crypto.randomUUID()}@example.test`
  const nickname = 'Оченьдлинныйникбезпробеловдляпроверки'
  const password = 'Browser-password-12345'
  const replacement = 'Replacement-password-12345'
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    const header = page.locator('header')
    const playerMenu = page.getByRole('button', { name: 'Меню игрока', exact: true })
    const menu = page.getByRole('menu', { name: 'Меню игрока' })
    const expectGuestNavigation = async () => {
      await expect(header.getByRole('link', { name: 'Вход', exact: true })).toBeVisible()
      await expect(header.getByRole('link', { name: 'Регистрация', exact: true })).toBeVisible()
      await expect(playerMenu).toHaveCount(0)
    }
    await page.goto('/')
    await expectGuestNavigation()
    for (const path of ['/account', '/account/cooldowns', '/account/reminders']) {
      await page.goto(path)
      await expect(page).toHaveURL(`/login?returnTo=${encodeURIComponent(path)}`)
    }
    await page.goto('/register')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Ник', { exact: true }).fill('Первый ник')
    await page.getByLabel('Новый пароль (12–128 символов)', { exact: true }).fill(password)
    await page.getByLabel('Подтверждение пароля', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 })
    const stored = await api.find({
      collection: 'players',
      overrideAccess: true,
      where: { email: { equals: email } },
    })
    expect(stored.docs).toHaveLength(1)
    expect(stored.docs[0]._verified).toBe(false)
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Пароль', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(page).toHaveURL(/\/account$/, { timeout: 20_000 })
    const cookie = (await context.cookies()).find((cookie) => cookie.name === 'evil-player-token')
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe('Lax')
    await expect(header.getByRole('navigation', { name: 'Аккаунт' })).toHaveCount(0)
    await expect(playerMenu).toContainText('Первый ник')
    await expect(playerMenu).toContainText(email)
    await expect(playerMenu.locator('[data-slot="avatar-fallback"]')).toBeVisible()
    for (const [label, path] of [
      ['Мои КД', '/account/cooldowns'],
      ['Напоминания', '/account/reminders'],
      ['Профиль', '/account'],
    ]) {
      await playerMenu.press('Enter')
      await expect(menu.getByRole('menuitem')).toHaveCount(4)
      await menu.getByRole('menuitem', { name: label, exact: true }).click()
      await expect(page).toHaveURL(path)
      await expect(page.getByRole('heading', { level: 1, name: label, exact: true })).toBeVisible()
      if (path === '/account/cooldowns') {
        await expect(page.getByRole('heading', { level: 3 })).toHaveText([
          'КД ивентов',
          'КД квестов',
        ])
      }
      if (path !== '/account') await expect(page.getByLabel('Ник', { exact: true })).toHaveCount(0)
    }
    await expect(page.getByRole('region', { name: 'Мои КД' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Регулярные подписки' })).toHaveCount(0)
    const denial = await context.request.post('/api/account/profile', {
      headers: { Origin: 'https://external.test' },
      data: { nickname: 'Взлом', timeZone: 'server' },
    })
    expect(denial.status()).toBe(403)
    expect((await context.request.get('/api/players')).status()).toBe(501)
    await page.getByLabel('Ник', { exact: true }).fill(nickname)
    await page.getByLabel('Часовой пояс', { exact: true }).selectOption('Europe/London')
    await page.getByRole('button', { name: 'Сохранить профиль' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Профиль сохранён.' })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Ник', { exact: true })).toHaveValue(nickname)
    await expect(page.getByLabel('Часовой пояс', { exact: true })).toHaveValue('Europe/London')
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: width === 320 ? 'dark' : 'light' })
      if (width === 320) await page.getByRole('button', { name: 'Открыть меню' }).click()
      await expect(playerMenu).toContainText(nickname)
      await playerMenu.click()
      await expect(menu.getByText(email, { exact: true })).toBeVisible()
      const bounds = (await menu.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      await page.keyboard.press('Escape')
      await expect(playerMenu).toBeFocused()
      if (width === 320) {
        await page.getByRole('button', { name: 'Закрыть меню' }).click()
        await expect(playerMenu.getByText(nickname, { exact: true })).toBeHidden()
        await expect(playerMenu.locator('[data-slot="avatar-fallback"]')).toBeVisible()
        await playerMenu.click({ position: { x: 4, y: 4 } })
        await expect(menu.getByText(nickname, { exact: true })).toBeVisible()
        const compactBounds = (await menu.boundingBox())!
        expect(compactBounds.x).toBeGreaterThanOrEqual(0)
        expect(compactBounds.x + compactBounds.width).toBeLessThanOrEqual(width)
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Открыть меню' }).click()
        await playerMenu.click()
        await menu.getByRole('menuitem', { name: 'Мои КД', exact: true }).click()
        await expect(page).toHaveURL('/account/cooldowns')
        await expect(page.getByRole('dialog', { name: 'Меню EvilIsland' })).toHaveCount(0)
        await expect(menu).toHaveCount(0)
        await page.goto('/account')
      } else {
        await page.getByRole('button', { name: 'Свернуть меню' }).click()
        await expect(playerMenu.getByText(nickname, { exact: true })).toBeHidden()
        await playerMenu.press('Enter')
        await expect(menu.getByText(nickname, { exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Развернуть меню' }).click()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({ path: `test-results/account-${width}.png`, fullPage: true })
    }
    await page.getByLabel('Текущий пароль', { exact: true }).fill('wrong-password')
    await page.getByLabel('Новый пароль (12–128 символов)', { exact: true }).fill(replacement)
    await page.getByLabel('Подтверждение пароля', { exact: true }).fill(replacement)
    await page.getByRole('button', { name: 'Изменить пароль', exact: true }).click()
    await expect(page.locator('.account-form__message[role="alert"]')).toContainText(
      'Не удалось войти',
    )
    await page.getByLabel('Текущий пароль', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Изменить пароль', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Пароль', { exact: true }).fill(replacement)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(page).toHaveURL(/\/account$/)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/(?:login|create-first-user)/)
    await page.goto('/account')
    await page.getByRole('button', { name: 'Открыть меню' }).click()
    await playerMenu.click()
    await menu.getByRole('menuitem', { name: 'Выйти', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expectGuestNavigation()
    expect((await context.cookies()).some((cookie) => cookie.name === 'evil-player-token')).toBe(
      false,
    )
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login\?returnTo=/)
    // Exercise the public reset form using a token issued by Payload on the isolated DB.
    const token = await api.forgotPassword({
      collection: 'players',
      overrideAccess: true,
      disableEmail: true,
      data: { email },
    })
    await page.goto(`/reset-password?token=${encodeURIComponent(token!)}`)
    await page.getByLabel('Новый пароль (12–128 символов)', { exact: true }).fill(password)
    await page.getByLabel('Подтверждение пароля', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Сохранить новый пароль' }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(errors).toEqual([])
  } finally {
    await api.delete({
      collection: 'players',
      overrideAccess: true,
      where: { email: { equals: email } },
    })
    await api.destroy()
  }
})

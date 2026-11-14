import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'

test('development account lifecycle, server protection and responsive forms', async ({
  page,
  context,
}) => {
  const api = await openTestPayload()
  const email = `browser-${crypto.randomUUID()}@example.test`
  const password = 'Browser-password-12345'
  const replacement = 'Replacement-password-12345'
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login\?returnTo=/)
    await page.goto('/register')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Ник', { exact: true }).fill('Первый ник')
    await page.getByLabel('Новый пароль (12–128 символов)', { exact: true }).fill(password)
    await page.getByLabel('Подтверждение пароля', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
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
    await expect(page).toHaveURL(/\/account$/)
    const cookie = (await context.cookies()).find((cookie) => cookie.name === 'evil-player-token')
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe('Lax')
    await expect(
      page.getByRole('navigation', { name: 'Аккаунт' }).getByRole('link', { name: 'Кабинет' }),
    ).toBeVisible()
    const denial = await context.request.post('/api/account/profile', {
      headers: { Origin: 'https://external.test' },
      data: { nickname: 'Взлом', timeZone: 'server' },
    })
    expect(denial.status()).toBe(403)
    expect((await context.request.get('/api/players')).status()).toBe(501)
    await page.getByLabel('Ник', { exact: true }).fill('Изменённый ник')
    await page.getByLabel('Часовой пояс', { exact: true }).selectOption('Europe/London')
    await page.getByRole('button', { name: 'Сохранить профиль' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Профиль сохранён.' })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Ник', { exact: true })).toHaveValue('Изменённый ник')
    await expect(page.getByLabel('Часовой пояс', { exact: true })).toHaveValue('Europe/London')
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: width === 375 ? 'dark' : 'light' })
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
    await page.getByRole('button', { name: 'Выйти', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
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

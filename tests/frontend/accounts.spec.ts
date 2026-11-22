import { expect, test } from '@playwright/test'

test('production account portal fails closed without delivery and guards guest writes', async ({
  page,
  request,
}) => {
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  const origin = 'http://localhost:3100'
  for (const action of ['register', 'forgot']) {
    const response = await request.post(`/api/account/${action}`, {
      headers: { Origin: origin },
      data: { email: 'production@example.test' },
    })
    expect(response.status()).toBe(503)
    expect(await response.text()).not.toContain('token')
  }
  expect(
    (
      await request.post('/api/account/profile', {
        headers: { Origin: origin },
        data: { nickname: 'Гость', timeZone: 'server' },
      })
    ).status(),
  ).toBe(401)
  expect((await request.get('/api/players')).status()).toBe(501)
  await page.goto('/events')
  await page
    .getByRole('navigation', { name: 'Аккаунт' })
    .getByRole('link', { name: 'Вход', exact: true })
    .click()
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fevents/)
})

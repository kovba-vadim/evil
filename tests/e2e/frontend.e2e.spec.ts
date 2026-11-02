import { test, expect } from '@playwright/test'

test('can open the public EvilIsland home page', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await expect(page).toHaveTitle('EvilIsland')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('EvilIsland')
})

import { expect, test } from '@playwright/test'

const sections = [
  ['Ивенты', '/events'],
  ['Квесты', '/quests'],
  ['Ивент-боссы', '/bosses'],
  ['Кастом одежда', '/clothing'],
  ['Кастом оружие', '/weapons'],
  ['Кастом предметы', '/items'],
  ['Craft', '/craft'],
  ['Запуск ивентов', '/event-launches'],
] as const

test('desktop navigation, active state, collapsed tooltips and keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('EvilIsland')
  const menu = page.getByRole('navigation', { name: 'Основное меню' })
  await expect(menu.getByRole('link')).toHaveText(sections.map(([title]) => title))
  for (const [title, href] of sections) {
    await menu.getByRole('link', { name: title, exact: true }).click()
    await expect(page).toHaveURL(href)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(menu.getByRole('link', { name: title, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  }
  await page.getByRole('button', { name: 'Свернуть меню', exact: true }).click()
  await expect(page.locator('[data-slot="sidebar"][data-state]')).toHaveAttribute(
    'data-state',
    'collapsed',
  )
  await menu.getByRole('link', { name: 'Ивенты', exact: true }).focus()
  await expect(page.getByRole('tooltip')).toContainText('Ивенты')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/events')
  await page.getByRole('button', { name: 'Развернуть меню', exact: true }).click()
  await page.getByRole('link', { name: 'EvilIsland — на главную' }).click()
  await expect(page).toHaveURL('/')
  await page.screenshot({ path: 'test-results/frontend-desktop.png' })
  expect(errors).toEqual([])
})

test('light, dark and system themes persist and follow system changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Выбрать тему', exact: true }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Системная' })).toBeChecked()
  await page.getByRole('menuitemradio', { name: 'Светлая' }).click()
  await expect(page.locator('html')).toHaveClass(/light/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/light/)
  await page.getByRole('button', { name: 'Выбрать тему', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Тёмная' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Выбрать тему', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Системная' }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveClass(/light/)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Выбрать тему', exact: true }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Системная' })).toBeChecked()
})

test('mobile sheet opens, closes with Escape and follows navigation without overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Открыть меню', exact: true })
  await trigger.click()
  const sheet = page.getByRole('dialog', { name: 'Меню EvilIsland' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toBeInViewport({ ratio: 0.95 })
  await page.screenshot({ path: 'test-results/frontend-mobile-menu.png' })
  await page.keyboard.press('Escape')
  await expect(sheet).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await sheet.getByRole('link', { name: 'Квесты', exact: true }).click()
  await expect(page).toHaveURL('/quests')
  await expect(sheet).not.toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Квесты')
  await trigger.click()
  await sheet.getByRole('button', { name: 'Закрыть меню', exact: true }).click()
  await expect(sheet).not.toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

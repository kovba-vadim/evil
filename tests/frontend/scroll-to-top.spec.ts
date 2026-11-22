import { expect, test } from '@playwright/test'

test('scroll-to-top is keyboard accessible and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({
      colorScheme,
      reducedMotion: colorScheme === 'dark' ? 'reduce' : 'no-preference',
    })
    await page.goto('/clothing')
    await expect(page.locator('html')).toHaveClass(new RegExp(colorScheme))
    await page.evaluate(() => {
      document.querySelector('main')!.style.minHeight = '2000px'
      const scroll = window.scrollTo.bind(window)
      window.scrollTo = (options?: ScrollToOptions | number, y?: number) => {
        if (typeof options === 'number') return scroll(options, y ?? 0)
        document.body.dataset.scrollBehavior = options?.behavior
        scroll(options)
      }
    })
    const button = page.getByRole('button', { name: 'Наверх' })
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await expect(button).toHaveCount(0)
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }))
    await expect(button).toBeVisible()
    const box = await button.boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(320)
    expect(box!.y + box!.height).toBeLessThanOrEqual(640)
    await button.focus()
    await expect(button).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('body')).toHaveAttribute(
      'data-scroll-behavior',
      colorScheme === 'dark' ? 'instant' : 'smooth',
    )
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await expect(button).toHaveCount(0)
  }
})

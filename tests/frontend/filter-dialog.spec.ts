import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'

test('filter dialogs apply drafts, cancel dismissals, count groups and scroll in both themes', async ({
  page,
}) => {
  const api = await openTestPayload()
  const fixtures = new ModelFixtures(api)
  const named = () => {
    const name = fixtures.name()
    return { name, slug: name }
  }
  try {
    const a = await fixtures.create('resources', named())
    const b = await fixtures.create('resources', named())
    const time = await fixtures.create('event-times', { time: '12:34', minutes: 754 })
    for (const [coins, both] of [
      [10, true],
      [20, false],
    ] as const)
      await fixtures.create('events', {
        ...named(),
        coins,
        cooldownMinutes: 0,
        durationMinutes: 30,
        launchTimes: [time.id],
        rewards: [
          { resource: a.id, minQuantity: 0, maxQuantity: 1 },
          ...(both ? [{ resource: b.id, minQuantity: 1, maxQuantity: 1 }] : []),
        ],
      })
    for (const path of ['/events', '/event-launches']) {
      for (const mobile of [false, true]) {
        await page.setViewportSize(
          mobile ? { width: 320, height: 480 } : { width: 1280, height: 720 },
        )
        await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
        await page.goto(path)
        const trigger = page.getByRole('button', { name: /^Фильтры/ })
        const quickReset = page
          .getByRole('main')
          .getByRole('button', { name: 'Сбросить', exact: true })
        const zone = page.getByLabel('Часовой пояс', { exact: true })
        const dialog = page.getByRole('dialog')
        const low = dialog.getByRole('spinbutton', { name: 'Монеты От', exact: true })
        const high = dialog.getByRole('spinbutton', { name: 'Монеты До', exact: true })
        const apply = dialog.getByRole('button', { name: 'Показать результаты' })
        await expect(dialog).toHaveCount(0)
        await expect(quickReset).toHaveCount(0)
        if (path === '/event-launches') await zone.selectOption('Europe/Berlin')
        await expect(page.getByRole('spinbutton')).toHaveCount(0)
        await trigger.click()
        await expect(dialog).toBeVisible()
        if (path === '/event-launches') {
          await expect(dialog.getByRole('combobox', { name: 'Часовой пояс' })).toHaveCount(0)
          await expect(
            page.locator('main').locator('select[aria-label="Часовой пояс"]'),
          ).toHaveCount(1)
        }
        await low.fill('15')
        await high.fill('10')
        await expect(apply).toBeDisabled()
        await high.fill('20')
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(trigger).toBeFocused()
        await expect(trigger).toHaveText('Фильтры')
        await trigger.click()
        await expect(low).toHaveValue('10')
        await low.fill('15')
        await dialog.getByRole('button', { name: 'Закрыть фильтры' }).click()
        await trigger.click()
        await expect(low).toHaveValue('10')
        await low.fill('15')
        await page.mouse.click(2, 2)
        await expect(dialog).toHaveCount(0)
        await expect(quickReset).toHaveCount(0)
        await trigger.click()
        await high.fill('10')
        await apply.click()
        await expect(trigger).toHaveText('Фильтры (1)')
        await expect(quickReset).toBeVisible()
        await trigger.click()
        await expect(low).toHaveValue('10')
        await high.fill('10')
        await dialog.getByRole('checkbox', { name: a.name, exact: true }).check()
        await dialog.getByRole('checkbox', { name: b.name, exact: true }).check()
        if (path === '/event-launches') {
          await dialog.getByLabel('Время От', { exact: true }).fill('23:00')
          await dialog.getByLabel('Время До', { exact: true }).fill('01:00')
        }
        await apply.click()
        await expect(dialog).toHaveCount(0)
        await expect(trigger).toHaveText(path === '/events' ? 'Фильтры (2)' : 'Фильтры (3)')
        if (path === '/events')
          await expect(page.getByText('Найдено: 1', { exact: true })).toBeVisible()
        await trigger.click()
        await expect(high).toHaveValue('10')
        await expect(dialog.getByRole('checkbox', { name: b.name, exact: true })).toBeChecked()
        await dialog.getByRole('button', { name: 'Сбросить', exact: true }).click()
        await expect(high).toHaveValue('20')
        await page.keyboard.press('Escape')
        await trigger.click()
        await expect(high).toHaveValue('10')
        // The scroll area must leave the footer inside the viewport at short heights.
        const footer = await apply.boundingBox()
        expect(footer!.y + footer!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
        if (mobile) {
          expect(
            await dialog
              .locator('.overflow-y-auto')
              .first()
              .evaluate((element) => element.scrollHeight > element.clientHeight),
          ).toBe(true)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.screenshot({
          path: `test-results/filters-${path.slice(1)}-${mobile ? 'mobile-dark' : 'desktop-light'}.png`,
        })
        await page.keyboard.press('Escape')
        await expect(quickReset).toBeVisible()
        await quickReset.click()
        await expect(dialog).toHaveCount(0)
        await expect(trigger).toHaveText('Фильтры')
        await expect(trigger).toBeFocused()
        await expect(quickReset).toHaveCount(0)
        if (path === '/events')
          await expect(page.getByText('Найдено: 2', { exact: true })).toBeVisible()
        else {
          await expect(zone).toHaveValue('Europe/Berlin')
          await expect(page.getByText('Запусков: 2', { exact: true })).toBeVisible()
        }
        await trigger.click()
        await expect(low).toHaveValue('10')
        await expect(high).toHaveValue('20')
        await expect(dialog.getByRole('checkbox', { name: a.name, exact: true })).not.toBeChecked()
        await expect(dialog.getByRole('checkbox', { name: b.name, exact: true })).not.toBeChecked()
        if (path === '/event-launches') {
          await expect(dialog.getByLabel('Время От', { exact: true })).toHaveValue('')
          await expect(dialog.getByLabel('Время До', { exact: true })).toHaveValue('')
        }
      }
    }
  } finally {
    await fixtures.cleanup()
    await api.destroy()
  }
})

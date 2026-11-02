import { expect, test } from '@playwright/test'
import { openTestPayload } from '../helpers/testDatabase'

test('homepage renders saved Lexical content and reflects edits on the next request', async ({
  page,
}) => {
  const api = await openTestPayload()
  const original = await api.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })
  let userID: number | undefined
  try {
    const account = await api.create({
      collection: 'users',
      data: {
        email: `homepage-browser-${crypto.randomUUID()}@example.test`,
        password: crypto.randomUUID(),
      },
      overrideAccess: true,
    })
    userID = account.id
    const user = { ...account, collection: 'users' as const }
    const text = (value: string) => ({
      type: 'text',
      version: 1,
      text: value,
      format: 0,
      detail: 0,
      mode: 'normal',
      style: '',
    })
    await api.updateGlobal({
      slug: 'homepage',
      overrideAccess: false,
      user,
      data: {
        title: 'Временная главная',
        image: null,
        description: {
          root: {
            type: 'root',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            children: [
              {
                type: 'heading',
                version: 1,
                tag: 'h2',
                children: [text('Проверка форматирования')],
              },
              { type: 'paragraph', version: 1, children: [text('Проверочный абзац')] },
              {
                type: 'list',
                version: 1,
                listType: 'bullet',
                tag: 'ul',
                start: 1,
                children: [
                  { type: 'listitem', version: 1, value: 1, children: [text('Первый элемент')] },
                ],
              },
              {
                type: 'paragraph',
                version: 1,
                children: [
                  {
                    type: 'link',
                    version: 3,
                    fields: { linkType: 'custom', url: 'https://example.org/', newTab: false },
                    children: [text('Проверочная ссылка')],
                  },
                ],
              },
            ],
          },
        },
      },
    })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Временная главная')
    const content = page.locator('.homepage-richtext')
    await expect(content.getByRole('heading', { level: 2 })).toBeVisible()
    await expect(content.locator('ul')).toHaveCSS('list-style-type', 'disc')
    await expect(content.getByRole('link')).toHaveCSS('color', 'rgb(79, 70, 229)')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(content.getByRole('link')).toHaveCSS('color', 'rgb(165, 180, 252)')
    await api.updateGlobal({
      slug: 'homepage',
      data: { title: 'Обновлено без сборки', description: null },
      user,
      overrideAccess: false,
    })
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Обновлено без сборки')
    await expect(content).toHaveCount(0)
    await expect(page.locator('article img')).toHaveCount(0)
  } finally {
    await api.updateGlobal({
      slug: 'homepage',
      overrideAccess: true,
      data: {
        title: original.title,
        description: original.description ?? null,
        image: original.image ?? null,
      },
    })
    if (userID !== undefined)
      await api.delete({ collection: 'users', id: userID, overrideAccess: true })
    await api.destroy()
  }
})

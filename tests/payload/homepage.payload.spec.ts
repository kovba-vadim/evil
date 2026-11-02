import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { Homepage, User } from '../../src/payload-types'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openTestPayload } from '../helpers/testDatabase'
import { getHomepage } from '../../src/queries/getHomepage'
import { HomepageContent } from '../../src/components/public/homepage-content'

let api: Payload | undefined
let original: Homepage | undefined
let user: (User & { collection: 'users' }) | undefined
let mediaID: number | undefined
let mediaDirectory: string
const text = (value: string) => ({
  type: 'text',
  version: 1,
  text: value,
  format: 0,
  detail: 0,
  mode: 'normal',
  style: '',
})
const description: NonNullable<Homepage['description']> = {
  root: {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [
      { type: 'heading', version: 1, tag: 'h2', children: [text('Тестовый заголовок')] },
      { type: 'paragraph', version: 1, children: [text('Тестовый абзац')] },
      {
        type: 'list',
        version: 1,
        listType: 'bullet',
        tag: 'ul',
        start: 1,
        children: [{ type: 'listitem', version: 1, value: 1, children: [text('Элемент списка')] }],
      },
      {
        type: 'paragraph',
        version: 1,
        children: [
          {
            type: 'link',
            version: 3,
            fields: { linkType: 'custom', url: 'https://example.org/', newTab: true },
            children: [text('Тестовая ссылка')],
          },
        ],
      },
    ],
  },
}

beforeAll(async () => {
  mediaDirectory = await mkdtemp(join(tmpdir(), 'evil-homepage-test-'))
  api = await openTestPayload({ mediaDirectory })
  original = await api.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })
  const account = await api.create({
    collection: 'users',
    data: { email: `homepage-${crypto.randomUUID()}@example.test`, password: crypto.randomUUID() },
    overrideAccess: true,
  })
  user = { ...account, collection: 'users' }
})

afterAll(async () => {
  try {
    if (api && original)
      await api.updateGlobal({
        slug: 'homepage',
        overrideAccess: true,
        data: {
          title: original.title ?? 'EvilIsland',
          description: original.description ?? null,
          image: original.image ?? null,
        },
      })
    if (api && mediaID !== undefined)
      await api.delete({ collection: 'media', id: mediaID, overrideAccess: true })
    if (api && user) await api.delete({ collection: 'users', id: user.id, overrideAccess: true })
  } finally {
    await api?.destroy()
    // Payload deletes the fixture file; remove only its now-empty temporary folder.
    if (mediaDirectory) await rmdir(mediaDirectory)
  }
})

describe('homepage Global on isolated PostgreSQL', () => {
  it('allows public reads using the actual page query and rejects anonymous updates', async () => {
    const before = await getHomepage(api!)
    expect(before.title).toBeTruthy()
    await expect(
      api!.updateGlobal({
        slug: 'homepage',
        data: { title: 'Анонимная запись запрещена' },
        user: null,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect((await getHomepage(api!)).title).toBe(before.title)
  })

  it('lets Users save content and returns subsequent changes without a rebuild or cache', async () => {
    for (const title of ['Временный заголовок главной', 'Изменённый заголовок главной']) {
      await api!.updateGlobal({
        slug: 'homepage',
        data: { title, description },
        user,
        overrideAccess: false,
      })
      const saved = await getHomepage(api!)
      expect(saved.title).toBe(title)
      const html = renderToStaticMarkup(createElement(HomepageContent, { homepage: saved }))
      expect(html).toContain(title)
      expect(html).toMatch(/<h2[^>]*>Тестовый заголовок<\/h2>/)
      expect(html).toContain('Тестовый абзац')
      expect(html).toMatch(/<ul[\s>]/)
      expect(html).toContain('Элемент списка')
      expect(html).toContain('href="https://example.org/"')
    }
  })

  it('populates an optional Media upload for public reading and renders its alt text', async () => {
    const data = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
      'base64',
    )
    const media = await api!.create({
      collection: 'media',
      data: { alt: 'Временное тестовое изображение' },
      user,
      overrideAccess: false,
      file: {
        data,
        mimetype: 'image/png',
        name: `homepage-${crypto.randomUUID()}.png`,
        size: data.length,
      },
    })
    mediaID = media.id
    await api!.updateGlobal({
      slug: 'homepage',
      data: { image: media.id },
      user,
      overrideAccess: false,
    })
    const saved = await getHomepage(api!)
    expect(saved.image).toMatchObject({ id: media.id, alt: media.alt })
    expect(renderToStaticMarkup(createElement(HomepageContent, { homepage: saved }))).toContain(
      'alt="Временное тестовое изображение"',
    )
  })

  it('omits cleared description and image without losing the title', async () => {
    await api!.updateGlobal({
      slug: 'homepage',
      data: { description: null, image: null },
      user,
      overrideAccess: false,
    })
    const saved = await getHomepage(api!)
    const html = renderToStaticMarkup(createElement(HomepageContent, { homepage: saved }))
    expect(html).toContain(saved.title)
    expect(html).not.toContain('homepage-richtext')
    expect(html).not.toContain('<img')
  })
})

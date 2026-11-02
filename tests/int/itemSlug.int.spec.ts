import { act, cleanup, render } from '@testing-library/react'
import { createElement, StrictMode } from 'react'
import type { FieldHook, SlugFieldClientProps, TextField } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { itemSlug } from '../../src/fields/itemSlug'
import { slugifyItemName } from '../../src/fields/slugifyItemName'
import { ItemSlugField } from '../../src/fields/ItemSlugField'

// Exercise the real observer against reactive form state without starting Payload or a DB.
const form = vi.hoisted(() => ({
  name: '',
  slug: '',
  id: undefined as number | undefined,
  listeners: new Set<() => void>(),
}))

vi.mock('@payloadcms/ui', async () => {
  const { useSyncExternalStore } = await import('react')
  const subscribe = (callback: () => void) => {
    form.listeners.add(callback)
    return () => form.listeners.delete(callback)
  }
  return {
    SlugField: () => null,
    useDocumentInfo: () => ({ id: form.id }),
    useFormFields: (select: (state: [{ name: { value: string } }]) => unknown) => {
      const name = useSyncExternalStore(subscribe, () => form.name)
      return select([{ name: { value: name } }])
    },
    useField: () => ({
      value: useSyncExternalStore(subscribe, () => form.slug),
      formInitializing: false,
      setValue: (value: string) => {
        form.slug = value
        form.listeners.forEach((callback) => callback())
      },
    }),
  }
})

const change = (values: Partial<Pick<typeof form, 'name' | 'slug' | 'id'>>) =>
  act(() => {
    Object.assign(form, values)
    form.listeners.forEach((callback) => callback())
  })

const field = itemSlug().fields.find((field) => field.type === 'text') as TextField
const mount = () =>
  render(
    createElement(ItemSlugField, {
      path: 'slug',
      field: { name: 'slug', type: 'text' },
      useAsSlug: 'name',
    } as SlugFieldClientProps),
  )

beforeEach(() => {
  form.name = ''
  form.slug = ''
  form.id = undefined
})
afterEach(cleanup)

describe('item slug without database writes', () => {
  it('transliterates and normalizes separators', () => {
    expect(slugifyItemName('Шлем Evil')).toBe('shlem-evil')
    expect(slugifyItemName('  Evil -- Helmet / V2  ')).toBe('evil-helmet-v2')
    expect(slugifyItemName('Щит, ёлка и ружьё')).toBe('shchit-yolka-i-ruzhyo')
  })

  it('follows Russian and English name edits before saving without unlocking', () => {
    mount()
    change({ name: 'Шлем Evil' })
    expect(form.slug).toBe('shlem-evil')
    change({ name: 'Evil Helmet' })
    expect(form.slug).toBe('evil-helmet')
  })

  it('stops following the name after a manual edit', () => {
    mount()
    change({ name: 'Шлем Evil' })
    change({ slug: 'my-custom-slug' })
    change({ name: 'Другое название' })
    expect(form.slug).toBe('my-custom-slug')
  })

  it('keeps following a prefilled name under React StrictMode', () => {
    form.name = 'Шлем Evil'
    render(
      createElement(
        StrictMode,
        null,
        createElement(ItemSlugField, {
          path: 'slug',
          field: { name: 'slug', type: 'text' },
          useAsSlug: 'name',
        } as SlugFieldClientProps),
      ),
    )
    expect(form.slug).toBe('shlem-evil')
    change({ name: 'Evil Helmet' })
    expect(form.slug).toBe('evil-helmet')
  })

  it('preserves supplied slugs and slugs of saved documents', () => {
    form.id = 12
    form.slug = 'старый-slug'
    mount()
    change({ name: 'Новое название' })
    expect(form.slug).toBe('старый-slug')
  })

  it('preserves a manually supplied slug when opening a new form', () => {
    form.slug = 'manual-before-mount'
    mount()
    change({ name: 'Шлем Evil' })
    expect(form.slug).toBe('manual-before-mount')
  })

  it.each([undefined, '', '   '])(
    'fills an empty server value (%s) before validation',
    async (value) => {
      const hook = field.hooks!.beforeValidate![0]
      expect(
        await hook({
          value,
          data: { name: 'Шлем Evil' },
          operation: 'create',
        } as unknown as Parameters<FieldHook>[0]),
      ).toBe('shlem-evil')
    },
  )

  it('preserves manual server input and existing slugs on rename', async () => {
    const hook = field.hooks!.beforeValidate![0]
    expect(
      await hook({
        value: 'Manual-Slug',
        data: { name: 'Шлем' },
        operation: 'create',
      } as unknown as Parameters<FieldHook>[0]),
    ).toBe('Manual-Slug')
    expect(
      await hook({
        data: { name: 'Новое имя' },
        originalDoc: { slug: 'старый-slug' },
        operation: 'update',
      } as unknown as Parameters<FieldHook>[0]),
    ).toBe('старый-slug')
  })

  it('does not let the native checkbox hook overwrite a manual slug', async () => {
    const checkbox = itemSlug().fields.find((field) => field.type === 'checkbox')
    if (!checkbox || checkbox.type !== 'checkbox') throw new Error('Missing checkbox')
    const data = { name: 'Новое название', slug: 'manual' }
    expect(
      await checkbox.hooks!.beforeChange![0]({
        value: true,
        data,
        operation: 'update',
      } as unknown as Parameters<FieldHook>[0]),
    ).toBe(false)
    expect(data.slug).toBe('manual')
    expect(field.unique).toBe(true)
  })
})

import { withSeoTab } from '../fields/seo'
import type { GlobalConfig } from 'payload'
import { authenticated } from '../access/authenticated'

export const Homepage: GlobalConfig = {
  slug: 'homepage',
  label: 'Главная страница',
  access: {
    read: () => true,
    update: authenticated,
  },
  fields: withSeoTab([
    { name: 'title', label: 'Название', type: 'text', required: true, defaultValue: 'EvilIsland' },
    { name: 'description', label: 'Описание', type: 'richText' },
    { name: 'image', label: 'Изображение', type: 'upload', relationTo: 'media' },
  ]),
}

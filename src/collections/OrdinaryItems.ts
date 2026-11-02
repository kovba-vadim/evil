import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { preventIngredientDeletion } from '../hooks/recipes'

export const OrdinaryItems: CollectionConfig = {
  slug: 'ordinary-items',
  orderable: true,
  labels: { singular: 'Обычный ресурс', plural: 'Обычные ресурсы' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'slug', 'updatedAt'] },
  access: {
    read: () => true,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: { beforeDelete: [preventIngredientDeletion('item')] },
  fields: [
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    { name: 'image', label: 'Изображение', type: 'upload', relationTo: 'media' },
    { name: 'description', label: 'Описание', type: 'richText' },
  ],
}

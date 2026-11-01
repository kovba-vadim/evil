import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { preventIngredientDeletion } from '../hooks/recipes'

export const OrdinaryItems: CollectionConfig = {
  slug: 'ordinary-items',
  labels: { singular: 'Обычный предмет', plural: 'Обычные предметы' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'slug', 'updatedAt'] },
  access: {
    read: authenticated,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: { beforeDelete: [preventIngredientDeletion('item')] },
  fields: [
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    { name: 'image', label: 'Изображение', type: 'upload', relationTo: 'media' },
  ],
}

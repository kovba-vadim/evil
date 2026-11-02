import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { recipeFields } from '../fields/recipe'
import { preventIngredientDeletion, validateRecipe } from '../hooks/recipes'

export const Resources: CollectionConfig = {
  slug: 'resources',
  orderable: true,
  labels: { singular: 'Кастомный предмет', plural: 'Кастомные предметы' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'craftable', 'slug', 'updatedAt'] },
  access: {
    read: authenticated,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: {
    beforeChange: [validateRecipe],
    beforeDelete: [preventIngredientDeletion('resource')],
  },
  fields: [
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    { name: 'image', label: 'Изображение', type: 'upload', relationTo: 'media' },
    { name: 'description', label: 'Описание', type: 'richText' },
    ...recipeFields(),
  ],
}

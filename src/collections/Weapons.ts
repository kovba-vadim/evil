import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { recipeFields } from '../fields/recipe'
import { validateRecipe } from '../hooks/recipes'

export const Weapons: CollectionConfig = {
  slug: 'weapons',
  orderable: true,
  labels: { singular: 'Оружие', plural: 'Оружие' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'craftable', 'slug', 'updatedAt'] },
  access: {
    read: authenticated,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: { beforeChange: [validateRecipe] },
  fields: [
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    { name: 'image', label: 'Изображение', type: 'upload', relationTo: 'media' },
    { name: 'description', label: 'Описание и характеристики', type: 'richText' },
    ...recipeFields(),
  ],
}

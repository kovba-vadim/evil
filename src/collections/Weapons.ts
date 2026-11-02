import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { recipeFields } from '../fields/recipe'
import { validateRecipe } from '../hooks/recipes'
import { hideInactivePublicRecipe } from '../hooks/publicRecipes'

export const Weapons: CollectionConfig = {
  slug: 'weapons',
  orderable: true,
  labels: { singular: 'Оружие', plural: 'Оружие' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'craftable', 'slug', 'updatedAt'] },
  access: {
    read: () => true,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: { beforeChange: [validateRecipe], afterRead: [hideInactivePublicRecipe] },
  fields: [
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    { name: 'image', label: 'Изображение', type: 'upload', relationTo: 'media' },
    { name: 'description', label: 'Описание и характеристики', type: 'richText' },
    ...recipeFields(),
  ],
}

import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { recipeFields } from '../fields/recipe'
import { validateRecipe } from '../hooks/recipes'
import { validateClothingSet } from '../hooks/equipmentSets'

export const Clothing: CollectionConfig = {
  slug: 'clothing',
  orderable: true,
  labels: { singular: 'Предмет одежды', plural: 'Одежда' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'equipmentSet', 'craftable'] },
  access: {
    read: authenticated,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: { beforeChange: [validateClothingSet, validateRecipe] },
  fields: [
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    { name: 'image', label: 'Изображение', type: 'upload', relationTo: 'media' },
    { name: 'description', label: 'Описание и характеристики', type: 'richText' },
    {
      name: 'equipmentSet',
      label: 'Сет',
      type: 'relationship',
      relationTo: 'equipment-sets',
      index: true,
      admin: {
        description: 'Для части комплекта выберите сет. Для хазмата оставьте пустым',
      },
    },
    ...recipeFields(),
  ],
}

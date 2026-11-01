import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { preventIngredientDeletion, validateRecipe } from '../hooks/recipes'

export const Resources: CollectionConfig = {
  slug: 'resources',
  labels: { singular: 'Кастомный ресурс', plural: 'Кастомные ресурсы' },
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
    { name: 'craftable', label: 'Можно скрафтить', type: 'checkbox', defaultValue: false },
    {
      name: 'recipe',
      label: 'Рецепт',
      type: 'group',
      admin: {
        condition: (data) => Boolean(data.craftable),
        description: 'При выключении крафта рецепт сохраняется как неактивный.',
      },
      fields: [
        {
          name: 'resourceIngredients',
          label: 'Кастомные ингредиенты',
          type: 'array',
          labels: { singular: 'Ингредиент', plural: 'Ингредиенты' },
          fields: [
            {
              name: 'resource',
              label: 'Ресурс',
              type: 'relationship',
              relationTo: 'resources',
              required: true,
            },
            { name: 'quantity', label: 'Количество', type: 'number', min: 1, required: true },
          ],
        },
        {
          name: 'ordinaryIngredients',
          label: 'Обычные ингредиенты',
          type: 'array',
          labels: { singular: 'Ингредиент', plural: 'Ингредиенты' },
          fields: [
            {
              name: 'item',
              label: 'Предмет',
              type: 'relationship',
              relationTo: 'ordinary-items',
              required: true,
            },
            { name: 'quantity', label: 'Количество', type: 'number', min: 1, required: true },
          ],
        },
        { name: 'coins', label: 'Стоимость в монетах', type: 'number', min: 0, defaultValue: 0 },
      ],
    },
  ],
}

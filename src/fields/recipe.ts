import type { Field } from 'payload'

export const recipeFields = (): Field[] => [
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
        label: 'Кастомные предметы',
        type: 'array',
        labels: { singular: 'Ингредиент', plural: 'Ингредиенты' },
        fields: [
          {
            name: 'resource',
            label: 'Кастомный предмет',
            type: 'relationship',
            relationTo: 'resources',
            required: true,
          },
          { name: 'quantity', label: 'Количество', type: 'number', min: 1, required: true },
        ],
      },
      {
        name: 'ordinaryIngredients',
        label: 'Обычные ресурсы',
        type: 'array',
        labels: { singular: 'Ингредиент', plural: 'Ингредиенты' },
        fields: [
          {
            name: 'item',
            label: 'Обычный ресурс',
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
]

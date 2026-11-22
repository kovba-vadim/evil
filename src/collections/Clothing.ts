import { shopFields } from '../fields/shopFields'
import { hideInactiveShop, validateShop } from '../hooks/shop'
import { withSeoTab } from '../fields/seo'
import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { recipeFields } from '../fields/recipe'
import { validateRecipe } from '../hooks/recipes'
import { clearFormerClothingSet, validateClothingSet } from '../hooks/equipmentSets'
import { hideInactivePublicRecipe } from '../hooks/publicRecipes'

export const Clothing: CollectionConfig = {
  slug: 'clothing',
  orderable: true,
  labels: { singular: 'Предмет одежды', plural: 'Одежда' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'category', 'equipmentSet', 'craftable'] },
  access: {
    read: () => true,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: {
    beforeChange: [validateClothingSet, validateRecipe, validateShop],
    afterRead: [hideInactivePublicRecipe, hideInactiveShop],
  },
  fields: withSeoTab([
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    { name: 'image', label: 'Изображение', type: 'upload', relationTo: 'media' },
    { name: 'description', label: 'Описание и характеристики', type: 'richText' },
    {
      name: 'category',
      label: 'Категория одежды',
      type: 'select',
      required: true,
      admin: { components: { Field: '/fields/ClothingCategoryField#ClothingCategoryField' } },
      options: [
        { value: 'set', label: 'Часть сета' },
        { value: 'hazmat', label: 'Хазмат' },
        { value: 'ring', label: 'Кольцо' },
      ],
    },
    {
      name: 'equipmentSet',
      label: 'Сет',
      type: 'relationship',
      relationTo: 'equipment-sets',
      index: true,
      hooks: { beforeValidate: [clearFormerClothingSet] },
      admin: {
        condition: (data) => data.category === 'set',
        description: 'Выберите комплект, в который входит предмет.',
      },
    },
    ...recipeFields(),
    shopFields({ clothing: true }),
  ]),
}

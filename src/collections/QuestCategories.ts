import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { preventQuestCategoryDeletion } from '../hooks/questCategories'

export const QuestCategories: CollectionConfig = {
  slug: 'quest-categories',
  orderable: true,
  labels: { singular: 'Категория квестов', plural: 'Категории квестов' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'slug', 'updatedAt'] },
  access: {
    read: authenticated,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: { beforeDelete: [preventQuestCategoryDeletion] },
  fields: [
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    {
      name: 'quests',
      label: 'Связанные квесты',
      type: 'join',
      collection: 'quests',
      on: 'category',
      defaultSort: '_order',
      admin: {
        allowCreate: false,
        defaultColumns: ['name', 'coins', 'cooldown'],
        description: 'Список определяется полем «Категория» у квестов.',
      },
    },
  ],
}

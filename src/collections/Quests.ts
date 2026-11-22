import { withSeoTab } from '../fields/seo'
import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { validateQuest } from '../hooks/questBossRewards'
import { normalizeQuestCooldown } from '../hooks/questCooldown'

export const Quests: CollectionConfig = {
  slug: 'quests',
  orderable: true,
  labels: { singular: 'Квест', plural: 'Квесты' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'category', 'coins', 'cooldown'] },
  access: {
    read: () => true,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: { beforeValidate: [normalizeQuestCooldown], beforeChange: [validateQuest] },
  fields: withSeoTab([
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    { name: 'description', label: 'Описание', type: 'richText' },
    {
      name: 'category',
      label: 'Категория',
      type: 'relationship',
      relationTo: 'quest-categories',
      index: true,
      admin: { description: 'Необязательно. Выберите одну категорию квеста.' },
    },
    { name: 'coins', label: 'Монеты', type: 'number', required: true, min: 0, defaultValue: 0 },
    {
      name: 'requiredQuantity',
      label: 'Необходимое количество',
      type: 'number',
      min: 1,
      admin: { description: 'Сколько нужно собрать, добыть или выполнить для завершения квеста' },
      validate: (value: unknown) =>
        value == null ||
        (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) ||
        'Укажите положительное целое число или оставьте поле пустым.',
    },
    {
      name: 'cooldown',
      label: 'КД прохождения (минуты)',
      type: 'number',
      defaultValue: 0,
      min: 0,
      validate: (value: unknown) =>
        value == null ||
        (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ||
        'Укажите целое неотрицательное число минут.',
      admin: {
        description:
          'Продолжительность в целых минутах. Пустое поле сохраняется как 0.',
      },
    },
    {
      name: 'cooldownMinutes',
      label: 'Прежний КД в минутах',
      type: 'number',
      min: 0,
      admin: {
        hidden: true,
        disableBulkEdit: true,
        disableListColumn: true,
        disableListFilter: true,
        description:
          'Историческая колонка. Для КД квеста используется поле «КД прохождения (минуты)».',
      },
    },
    {
      name: 'rewards',
      label: 'Награды: кастомные предметы',
      type: 'array',
      labels: { singular: 'Награда', plural: 'Награды' },
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
      name: 'ordinaryRewards',
      label: 'Награды: обычные ресурсы',
      type: 'array',
      labels: { singular: 'Награда', plural: 'Награды' },
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
  ]),
}

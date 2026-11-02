import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { validateEvent } from '../hooks/events'

export const Events: CollectionConfig = {
  slug: 'events',
  orderable: true,
  labels: { singular: 'Ивент', plural: 'Ивенты' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'launchTimes', 'coins', 'cooldownMinutes'],
  },
  access: {
    read: authenticated,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: { beforeChange: [validateEvent] },
  fields: [
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    { name: 'shortDescription', label: 'Короткое описание', type: 'text' },
    { name: 'description', label: 'Полное описание', type: 'richText' },
    {
      name: 'launchTimes',
      label: 'Времена запуска',
      type: 'relationship',
      relationTo: 'event-times',
      hasMany: true,
      admin: {
        description:
          'Выберите известные ежедневные времена по серверу UTC+3. Расписание не генерируется автоматически.',
      },
    },
    {
      name: 'coins',
      label: 'Монеты за прохождение',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
      index: true,
    },
    {
      name: 'cooldownMinutes',
      label: 'КД прохождения (минуты)',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
      admin: { description: 'Правило игры, а не интервал запусков и не личный таймер.' },
    },
    {
      name: 'rewards',
      label: 'Возможные награды: кастомные предметы',
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
        {
          name: 'minQuantity',
          label: 'Минимальное количество',
          type: 'number',
          required: true,
          min: 0,
          admin: { description: '0 — кастомный предмет может не выпасть.' },
        },
        {
          name: 'maxQuantity',
          label: 'Максимальное количество',
          type: 'number',
          required: true,
          min: 1,
        },
      ],
    },
  ],
}

import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { deriveEventMinutes, preventEventTimeDeletion } from '../hooks/eventTimes'

export const EventTimes: CollectionConfig = {
  slug: 'event-times',
  orderable: true,
  labels: { singular: 'Время запуска', plural: 'Время запусков' },
  admin: {
    useAsTitle: 'time',
    defaultColumns: ['time', 'minutes'],
    description: 'Ежедневное время по серверу UTC+3, без календарной даты.',
  },
  access: {
    read: () => true,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: { beforeValidate: [deriveEventMinutes], beforeDelete: [preventEventTimeDeletion] },
  fields: [
    {
      name: 'time',
      label: 'Время по серверу (UTC+3)',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        placeholder: 'HH:mm',
        description: 'От 00:00 до 23:59. Например, 05:25. Вводите время вручную.',
      },
    },
    {
      name: 'minutes',
      label: 'Минуты от начала суток',
      type: 'number',
      required: true,
      // The disabled input must be valid before the first server save.
      // This placeholder is always replaced by deriveEventMinutes.
      defaultValue: 0,
      index: true,
      min: 0,
      max: 1439,
      admin: {
        readOnly: true,
        description:
          'Вычисляются сервером при сохранении. До первого сохранения показан 0. Для хронологической сортировки запросов используйте minutes.',
      },
    },
  ],
}

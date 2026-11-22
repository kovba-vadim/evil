import type { CollectionConfig } from 'payload'
import { reminderAccess, reminderHooks } from '../access/player-reminders'

export const PlayerEventReminders: CollectionConfig = {
  slug: 'player-event-reminders',
  labels: { singular: 'Настройка напоминания', plural: 'Настройки напоминаний' },
  admin: { hidden: true },
  access: reminderAccess,
  hooks: reminderHooks,
  indexes: [{ fields: ['player', 'event', 'kind'], unique: true }],
  fields: [
    {
      name: 'player',
      label: 'Игрок',
      type: 'relationship',
      relationTo: 'players',
      required: true,
      maxDepth: 0,
      index: true,
    },
    {
      name: 'event',
      label: 'Ивент',
      type: 'relationship',
      relationTo: 'events',
      required: true,
      maxDepth: 0,
      index: true,
    },
    {
      name: 'kind',
      label: 'Тип',
      type: 'select',
      options: [
        { label: 'Один запуск', value: 'once' },
        { label: 'Пока я играю', value: 'regular' },
      ],
      required: true,
    },
    {
      name: 'leadMinutes',
      label: 'Предупредить за (минут)',
      type: 'number',
      min: 1,
      max: 120,
      required: true,
      validate: (value: unknown) =>
        (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 120) ||
        'Введите целое число от 1 до 120.',
    },
    {
      name: 'includeCooldown',
      label: 'Показывать личный КД',
      type: 'checkbox',
      required: true,
      defaultValue: true,
    },
    {
      name: 'enabled',
      label: 'Подписка включена',
      type: 'checkbox',
      required: true,
      defaultValue: true,
    },
    { name: 'launchAt', label: 'Выбранный запуск (UTC)', type: 'date' },
    { name: 'remindAt', label: 'Время предупреждения (UTC)', type: 'date' },
    { name: 'revision', label: 'Версия настройки', type: 'text', required: true },
    {
      name: 'requestID',
      label: 'Идентификатор операции',
      type: 'text',
      required: true,
      hidden: true,
      access: { read: () => false },
    },
  ],
}

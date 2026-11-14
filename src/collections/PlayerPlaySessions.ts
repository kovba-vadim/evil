import type { CollectionConfig } from 'payload'
import { reminderAccess, reminderHooks } from '../access/player-reminders'

export const PlayerPlaySessions: CollectionConfig = {
  slug: 'player-play-sessions',
  labels: { singular: 'Режим «Я играю»', plural: 'Режимы «Я играю»' },
  admin: { hidden: true },
  access: reminderAccess,
  hooks: reminderHooks,
  fields: [
    {
      name: 'player',
      label: 'Игрок',
      type: 'relationship',
      relationTo: 'players',
      required: true,
      unique: true,
      maxDepth: 0,
    },
    { name: 'startedAt', label: 'Начало периода (UTC)', type: 'date', required: true },
    { name: 'endsAt', label: 'Окончание периода (UTC)', type: 'date', required: true },
    { name: 'revision', label: 'Версия периода', type: 'text', required: true },
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

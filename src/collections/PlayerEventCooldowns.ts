import type { CollectionConfig } from 'payload'
import {
  cooldownWriteCapability,
  ownCooldowns,
  writeOwnCooldowns,
} from '../access/player-cooldowns'

export const PlayerEventCooldowns: CollectionConfig = {
  slug: 'player-event-cooldowns',
  labels: { singular: 'Личный КД ивента', plural: 'Личные КД ивентов' },
  admin: { hidden: true },
  indexes: [{ fields: ['player', 'event'], unique: true }],
  access: {
    admin: () => false,
    read: ownCooldowns,
    create: writeOwnCooldowns,
    update: writeOwnCooldowns,
    delete: writeOwnCooldowns,
  },
  hooks: {
    beforeChange: [
      ({ data, req }) => {
        if (req.context.cooldownWrite !== cooldownWriteCapability)
          throw new Error('Используйте операции отметки прохождения.')
        return data
      },
    ],
    beforeDelete: [
      ({ req }) => {
        if (req.context.cooldownWrite !== cooldownWriteCapability)
          throw new Error('Используйте отмену отметки.')
      },
    ],
  },
  fields: [
    {
      name: 'player',
      label: 'Игрок',
      type: 'relationship',
      relationTo: 'players',
      required: true,
      index: true,
      maxDepth: 0,
    },
    {
      name: 'event',
      label: 'Ивент',
      type: 'relationship',
      relationTo: 'events',
      required: true,
      index: true,
      maxDepth: 0,
    },
    { name: 'completedAt', label: 'Время прохождения', type: 'date', required: true },
    { name: 'cooldownUntil', label: 'Окончание КД', type: 'date', required: true, index: true },
    {
      name: 'cancelled',
      label: 'Отметка отменена',
      type: 'checkbox',
      defaultValue: false,
      required: true,
    },
    { name: 'revision', label: 'Версия отметки', type: 'text', required: true },
    {
      name: 'requestID',
      label: 'Идентификатор запроса',
      type: 'text',
      required: true,
      hidden: true,
      access: { read: () => false },
    },
  ],
}

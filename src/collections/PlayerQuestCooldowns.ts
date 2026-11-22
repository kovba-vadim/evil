import type { CollectionConfig } from 'payload'
import { PlayerEventCooldowns } from './PlayerEventCooldowns'

export const PlayerQuestCooldowns: CollectionConfig = {
  ...PlayerEventCooldowns,
  slug: 'player-quest-cooldowns',
  labels: { singular: 'Личный КД квеста', plural: 'Личные КД квестов' },
  lockDocuments: false,
  indexes: [{ fields: ['player', 'quest'], unique: true }],
  fields: PlayerEventCooldowns.fields.map((field) =>
    field.type === 'relationship' && field.name === 'event'
      ? {
          type: 'relationship',
          name: 'quest',
          label: 'Квест',
          relationTo: 'quests',
          required: true,
          index: true,
          maxDepth: 0,
        }
      : field,
  ),
}

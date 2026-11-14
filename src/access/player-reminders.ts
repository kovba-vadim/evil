import type { Access, CollectionConfig } from 'payload'

export const reminderWriteCapability = Symbol.for('evil.player-reminder-write')
const own: Access = ({ req }) =>
  req.user?.collection === 'players' ? { player: { equals: req.user.id } } : false
const write: Access = (args) =>
  args.req.context.reminderWrite === reminderWriteCapability ? own(args) : false
export const reminderAccess: CollectionConfig['access'] = {
  admin: () => false,
  read: own,
  create: write,
  update: write,
  delete: write,
}
export const reminderHooks: CollectionConfig['hooks'] = {
  beforeChange: [
    ({ data, req }) => {
      if (req.context.reminderWrite !== reminderWriteCapability)
        throw new Error('Используйте операции настроек напоминаний.')
      return data
    },
  ],
  beforeDelete: [
    ({ req }) => {
      if (req.context.reminderWrite !== reminderWriteCapability)
        throw new Error('Используйте операции настроек напоминаний.')
    },
  ],
}

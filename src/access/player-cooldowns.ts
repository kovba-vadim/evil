import type { Access } from 'payload'

// A JSON request cannot manufacture this server-only capability.
export const cooldownWriteCapability = Symbol.for('evil.player-cooldown-write')
export const ownCooldowns: Access = ({ req }) =>
  req.user?.collection === 'players' ? { player: { equals: req.user.id } } : false
export const writeOwnCooldowns: Access = (args) =>
  args.req.context.cooldownWrite === cooldownWriteCapability ? ownCooldowns(args) : false

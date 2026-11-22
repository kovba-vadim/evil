import type { Access, CollectionConfig } from 'payload'
import { baseVerificationFields } from 'payload'
import { authenticated } from '../access/authenticated'
import { TIME_ZONES } from '../lib/time-zones'
import { isDevelopment, passwordError } from '../lib/player-policy'

const self: Access = ({ req }) =>
  req.user?.collection === 'players'
    ? { id: { equals: req.user.id } }
    : req.user?.collection === 'users'

export const Players: CollectionConfig = {
  slug: 'players',
  labels: { singular: 'Игрок', plural: 'Игроки' },
  admin: { useAsTitle: 'nickname', group: 'Пользователи' },
  // All public mutations go through the bounded, same-origin portal API.
  endpoints: false,
  graphQL: false,
  access: {
    admin: () => false,
    create: authenticated,
    read: self,
    update: self,
    delete: authenticated,
    unlock: authenticated,
  },
  auth: {
    verify: !isDevelopment(),
    maxLoginAttempts: 5,
    lockTime: 15 * 60_000,
    tokenExpiration: 7200,
    useSessions: true,
    cookies: { sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' },
    forgotPassword: { expiration: 30 * 60_000 },
  },
  hooks: {
    beforeLogin: [
      ({ user }) => {
        if (!isDevelopment() && !user._verified) throw new Error('Email verification required')
        return user
      },
    ],
    beforeChange: [
      ({ data, operation, req }) => {
        if (data.password && passwordError(data.password))
          throw new Error(passwordError(data.password)!)
        if (operation === 'update' && req.user?.collection === 'players') {
          if (data.password && !req.context.playerPasswordChange)
            throw new Error('Current password required')
        }
        return data
      },
    ],
  },
  fields: [
    // Keep identical verification columns in development and production.
    ...baseVerificationFields.filter((field) => 'name' in field && field.name !== '_verified'),
    {
      name: 'nickname',
      label: 'Ник',
      type: 'text',
      required: true,
      minLength: 2,
      maxLength: 40,
      validate: (value: unknown) =>
        (typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 40) ||
        'Введите ник от 2 до 40 символов.',
    },
    {
      name: 'timeZone',
      label: 'Часовой пояс',
      type: 'select',
      required: true,
      defaultValue: 'server',
      options: TIME_ZONES.map(({ id, city }) => ({ value: id, label: city })),
    },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
      access: { update: ({ req }) => req.user?.collection === 'users' },
    },
    {
      name: '_verified',
      type: 'checkbox',
      label: 'Email подтверждён',
      defaultValue: false,
      access: {
        create: ({ req }) => req.user?.collection === 'users',
        update: ({ req }) => req.user?.collection === 'users',
      },
    },
  ],
}

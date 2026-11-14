import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: { admin: ({ req }) => req.user?.collection === 'users', create: authenticated, read: authenticated, update: authenticated, delete: authenticated, unlock: authenticated },
  fields: [
    // Email added by default
    // Add more fields as needed
  ],
}

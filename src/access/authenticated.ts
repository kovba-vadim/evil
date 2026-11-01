import type { Access } from 'payload'

export const authenticated: Access = ({ req }) => req.user?.collection === 'users'

import type { CollectionAfterReadHook } from 'payload'

/** Run after field traversal: keep reverse queries valid, hide inactive data. */
export const hideInactivePublicRecipe: CollectionAfterReadHook = ({ doc, req, overrideAccess }) => {
  if (overrideAccess || req.user?.collection === 'users' || doc.craftable === true) return doc
  const publicDoc = { ...doc }
  delete publicDoc.recipe
  return publicDoc
}

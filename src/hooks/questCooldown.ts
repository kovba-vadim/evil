import type { CollectionBeforeValidateHook } from 'payload'
import type { Quest } from '../payload-types'

export const normalizeQuestCooldown: CollectionBeforeValidateHook<Quest> = ({
  data,
  originalDoc,
}) => {
  if (
    data &&
    (data.cooldown === null || (data.cooldown === undefined && originalDoc?.cooldown == null))
  ) {
    data.cooldown = 0
  }
  return data
}

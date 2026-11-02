import type { CollectionBeforeValidateHook, FieldHook } from 'payload'
import type { Quest } from '../payload-types'

export function legacyQuestCooldown(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? `${value} минут`
    : undefined
}

/** Read compatibility until an old quest has been saved with the new field. */
export const readQuestCooldown: FieldHook = ({ value, siblingData }) =>
  value ?? legacyQuestCooldown(siblingData?.cooldownMinutes)

/** Convert atomically with normal saves; explicitly clearing text must remain possible. */
export const migrateQuestCooldown: CollectionBeforeValidateHook<Quest> = ({
  data,
  originalDoc,
}) => {
  if (!data) return data
  if (data.cooldown === undefined) {
    const existing = originalDoc?.cooldown
    const legacy = data.cooldownMinutes ?? originalDoc?.cooldownMinutes
    const text = existing ?? legacyQuestCooldown(legacy)
    if (text !== undefined) data.cooldown = text
  }
  // Keep the column in the schema. Only clear a row's old value together with
  // writing its text (or an explicit user clear), never before that write.
  if (data.cooldown !== undefined) data.cooldownMinutes = null
  return data
}

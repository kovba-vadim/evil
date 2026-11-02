import { APIError, ValidationError } from 'payload'
import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook } from 'payload'
import type { Clothing } from '../payload-types'

export const validateClothingSet: CollectionBeforeChangeHook<Clothing> = async ({
  data,
  originalDoc,
  req,
}) => {
  const equipmentSet =
    data.equipmentSet === undefined ? originalDoc?.equipmentSet : data.equipmentSet
  const id = equipmentSet && typeof equipmentSet === 'object' ? equipmentSet.id : equipmentSet
  const errors: { path: string; message: string }[] = []

  if (id != null) {
    const found = await req.payload.find({
      collection: 'equipment-sets',
      where: { id: { equals: id } },
      limit: 1,
      depth: 0,
      req,
      overrideAccess: true,
    })
    if (!found.docs.length)
      errors.push({ path: 'equipmentSet', message: 'Выбранный сет не существует.' })
  }
  if (errors.length) throw new ValidationError({ collection: 'clothing', errors, req })
  return data
}

export const preventSetDeletion: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const used = await req.payload.find({
    collection: 'clothing',
    where: { equipmentSet: { equals: id } },
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
  })
  if (used.docs.length) {
    throw new APIError(
      `Нельзя удалить сет: на него ссылается одежда «${used.docs[0].name}». Сначала удалите связь или перенесите часть в другой сет.`,
      400,
    )
  }
}

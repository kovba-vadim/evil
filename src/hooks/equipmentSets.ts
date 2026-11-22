import { APIError, ValidationError } from 'payload'
import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, FieldHook } from 'payload'
import type { Clothing } from '../payload-types'

export const clearFormerClothingSet: FieldHook<Clothing> = ({ originalDoc, siblingData }) => {
  // This runs before Payload fills an omitted relationship from the original document.
  if (
    originalDoc?.category === 'set' &&
    (siblingData.category === 'hazmat' || siblingData.category === 'ring') &&
    siblingData.equipmentSet === undefined
  ) {
    return null
  }
}

export const validateClothingSet: CollectionBeforeChangeHook<Clothing> = async ({
  data,
  originalDoc,
  req,
}) => {
  const equipmentSet =
    data.equipmentSet === undefined ? originalDoc?.equipmentSet : data.equipmentSet
  const id = equipmentSet && typeof equipmentSet === 'object' ? equipmentSet.id : equipmentSet
  const category = data.category === undefined ? originalDoc?.category : data.category
  let message: string | undefined
  if (category === 'set' && id == null) {
    message = 'Для части сета выберите комплект.'
  } else if ((category === 'hazmat' || category === 'ring') && id != null) {
    message = 'У самостоятельного предмета не должно быть связи с сетом.'
  } else if (id != null) {
    const found = await req.payload.find({
      collection: 'equipment-sets',
      where: { id: { equals: id } },
      limit: 1,
      depth: 0,
      req,
      overrideAccess: true,
    })
    if (!found.docs.length) message = 'Выбранный сет не существует.'
  }
  if (message)
    throw new ValidationError({
      collection: 'clothing',
      errors: [{ path: 'equipmentSet', message }],
      req,
    })
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

import { APIError } from 'payload'
import type { CollectionBeforeDeleteHook } from 'payload'

export const preventQuestCategoryDeletion: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const used = await req.payload.find({
    collection: 'quests',
    where: { category: { equals: id } },
    depth: 0,
    limit: 1,
    req,
    overrideAccess: true,
  })
  if (used.docs.length) {
    throw new APIError(
      `Нельзя удалить категорию: она выбрана в квесте «${used.docs[0].name}». Сначала уберите или замените категорию в квесте.`,
      400,
    )
  }
}

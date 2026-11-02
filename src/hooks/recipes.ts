import { APIError, ValidationError } from 'payload'
import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook } from 'payload'
import type { Resource } from '../payload-types'

type ID = number | string

function relationshipID(value: unknown): ID | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return relationshipID(value.id)
}

export const validateRecipe: CollectionBeforeChangeHook<
  Pick<Resource, 'id' | 'craftable' | 'recipe'>
> = async ({ data, originalDoc, req, collection }) => {
  // PATCH can omit the group or individual group fields. Arrays are replaced, not merged.
  const recipe = data.recipe === null ? null : { ...originalDoc?.recipe, ...data.recipe }
  const craftable = data.craftable ?? originalDoc?.craftable ?? false
  const errors: { path: string; message: string }[] = []
  const fail = (path: string, message: string) => errors.push({ path, message })
  const resources = recipe?.resourceIngredients ?? []
  const ordinary = recipe?.ordinaryIngredients ?? []

  if (craftable && resources.length + ordinary.length === 0) {
    fail('recipe', 'Для крафта нужен хотя бы один ингредиент.')
  }
  if (recipe?.coins != null && (!Number.isSafeInteger(recipe.coins) || recipe.coins < 0)) {
    fail('recipe.coins', 'Стоимость должна быть целым неотрицательным числом.')
  }
  if (craftable && recipe?.coins == null) {
    fail('recipe.coins', 'Укажите стоимость в монетах (0 — бесплатно).')
  }

  for (const [rows, field, link, collection] of [
    [resources, 'resourceIngredients', 'resource', 'resources'],
    [ordinary, 'ordinaryIngredients', 'item', 'ordinary-items'],
  ] as const) {
    const seen = new Set<string>()
    for (const [index, row] of rows.entries()) {
      const path = `recipe.${field}.${index}`
      const id = relationshipID(
        link === 'resource'
          ? 'resource' in row
            ? row.resource
            : undefined
          : 'item' in row
            ? row.item
            : undefined,
      )
      if (!Number.isSafeInteger(row.quantity) || row.quantity <= 0) {
        fail(`${path}.quantity`, 'Количество должно быть целым положительным числом.')
      }
      if (id === undefined) {
        fail(`${path}.${link}`, 'Выберите ингредиент.')
        continue
      }
      if (seen.has(String(id))) fail(`${path}.${link}`, 'Ингредиент уже указан в этом списке.')
      seen.add(String(id))
      const found = await req.payload.find({
        collection,
        where: { id: { equals: id } },
        limit: 1,
        depth: 0,
        req,
        overrideAccess: true,
      })
      if (!found.docs.length) fail(`${path}.${link}`, 'Выбранный ингредиент не существует.')
    }
  }

  if (errors.length) throw new ValidationError({ collection: collection.slug, errors, req })

  if (craftable && collection.slug === 'resources') {
    const target = relationshipID(originalDoc?.id ?? data.id)
    const visited = new Set<string>()
    const pending = resources.map((row) => relationshipID(row.resource)!)
    // Iterative traversal avoids stack overflow and populated relationship recursion.
    while (pending.length) {
      const id = pending.pop()!
      if (target !== undefined && String(id) === String(target)) {
        throw new ValidationError({
          collection: 'resources',
          req,
          errors: [
            {
              path: 'recipe.resourceIngredients',
              message: 'Рецепт образует циклическую зависимость ресурсов.',
            },
          ],
        })
      }
      if (visited.has(String(id))) continue
      visited.add(String(id))
      const resource = await req.payload.findByID({
        collection: 'resources',
        id,
        depth: 0,
        req,
        overrideAccess: true,
      })
      if (resource.craftable) {
        for (const row of resource.recipe?.resourceIngredients ?? []) {
          const next = relationshipID(row.resource)
          if (next !== undefined) pending.push(next)
        }
      }
    }
  }
  return data
}

export const preventIngredientDeletion =
  (kind: 'resource' | 'item'): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    const field = kind === 'resource' ? 'resourceIngredients.resource' : 'ordinaryIngredients.item'
    // Deliberately includes inactive recipes: hiding a recipe does not remove its references.
    for (const collection of ['resources', 'clothing', 'weapons'] as const) {
      const used = await req.payload.find({
        collection,
        where: { [`recipe.${field}`]: { equals: id } },
        limit: 1,
        depth: 0,
        req,
        overrideAccess: true,
      })
      if (used.docs.length) {
        const label = { resources: 'Кастомные предметы', clothing: 'Одежда', weapons: 'Оружие' }[
          collection
        ]
        throw new APIError(
          `Нельзя удалить ингредиент: он используется в рецепте «${used.docs[0].name}» (${label}). Сначала удалите ссылку из рецепта, включая неактивный.`,
          400,
        )
      }
    }
    if (kind === 'item') {
      const quests = await req.payload.find({
        collection: 'quests',
        where: { 'ordinaryRewards.item': { equals: id } },
        depth: 0,
        limit: 1,
        req,
        overrideAccess: true,
      })
      if (quests.docs.length) {
        throw new APIError(
          `Нельзя удалить обычный ресурс: он указан в наградах квеста «${quests.docs[0].name}». Сначала удалите ссылку из наград.`,
          400,
        )
      }
    }
    if (kind === 'resource') {
      const used = await req.payload.find({
        collection: 'events',
        where: { 'rewards.resource': { equals: id } },
        depth: 0,
        limit: 1,
        req,
        overrideAccess: true,
      })
      if (used.docs.length) {
        throw new APIError(
          `Нельзя удалить кастомный предмет: он указан в возможных наградах ивента «${used.docs[0].name}». Сначала удалите ссылку из наград.`,
          400,
        )
      }
      const quests = await req.payload.find({
        collection: 'quests',
        where: { 'rewards.resource': { equals: id } },
        depth: 0,
        limit: 1,
        req,
        overrideAccess: true,
      })
      if (quests.docs.length) {
        throw new APIError(
          `Нельзя удалить кастомный предмет: он указан в наградах квеста «${quests.docs[0].name}». Сначала удалите ссылку из наград.`,
          400,
        )
      }
      const bosses = await req.payload.find({
        collection: 'bosses',
        // Legacy links still protect bosses that have not been backfilled yet.
        where: {
          or: [
            { 'rewards.resource': { equals: id } },
            { goldenHeart: { equals: id } },
            { personalHeart: { equals: id } },
          ],
        },
        depth: 0,
        limit: 1,
        req,
        overrideAccess: true,
      })
      if (bosses.docs.length) {
        throw new APIError(
          `Нельзя удалить кастомный предмет: он указан в наградах ивент-босса «${bosses.docs[0].name}». Сначала удалите ссылку из наград или удалите запись босса.`,
          400,
        )
      }
    }
  }

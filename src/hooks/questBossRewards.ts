import { ValidationError } from 'payload'
import type { CollectionBeforeChangeHook, PayloadRequest, ValidationFieldError } from 'payload'
import type { Boss, Quest } from '../payload-types'

function resourceID(value: unknown): number | string | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return resourceID(value.id)
}

function validateCoins(value: unknown, errors: ValidationFieldError[]) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push({ path: 'coins', message: 'Монеты должны быть целым неотрицательным числом.' })
  }
}

async function validateReference(
  value: unknown,
  path: string,
  req: PayloadRequest,
  errors: ValidationFieldError[],
  collection: 'resources' | 'ordinary-items' | 'quest-categories' = 'resources',
) {
  const id = resourceID(value)
  if (id === undefined || id === '') {
    errors.push({ path, message: 'Выберите запись из справочника.' })
    return
  }
  const found = await req.payload.find({
    collection,
    where: { id: { equals: id } },
    depth: 0,
    limit: 1,
    req,
    overrideAccess: true,
  })
  if (!found.docs.length) errors.push({ path, message: 'Выбранная запись не существует.' })
}

export const validateQuest: CollectionBeforeChangeHook<Quest> = async ({
  data,
  originalDoc,
  req,
}) => {
  const current = { ...originalDoc, ...data }
  const errors: ValidationFieldError[] = []
  validateCoins(current.coins, errors)
  if (
    current.requiredQuantity != null &&
    (!Number.isSafeInteger(current.requiredQuantity) || current.requiredQuantity <= 0)
  ) {
    errors.push({
      path: 'requiredQuantity',
      message:
        'Необходимое количество должно быть положительным целым числом или оставаться пустым.',
    })
  }
  if (current.category != null) {
    await validateReference(current.category, 'category', req, errors, 'quest-categories')
  }
  const seen = new Set<string>()
  for (const [index, reward] of (current.rewards ?? []).entries()) {
    const path = `rewards.${index}`
    if (!Number.isSafeInteger(reward.quantity) || reward.quantity <= 0) {
      errors.push({
        path: `${path}.quantity`,
        message: 'Количество должно быть целым положительным числом.',
      })
    }
    const id = resourceID(reward.resource)
    if (id !== undefined) {
      if (seen.has(String(id)))
        errors.push({
          path: `${path}.resource`,
          message: 'Кастомный предмет уже указан в наградах.',
        })
      seen.add(String(id))
    }
    await validateReference(reward.resource, `${path}.resource`, req, errors)
  }
  const seenItems = new Set<string>()
  for (const [index, reward] of (current.ordinaryRewards ?? []).entries()) {
    const path = `ordinaryRewards.${index}`
    if (!Number.isSafeInteger(reward.quantity) || reward.quantity <= 0) {
      errors.push({
        path: `${path}.quantity`,
        message: 'Количество должно быть целым положительным числом.',
      })
    }
    const id = resourceID(reward.item)
    if (id !== undefined) {
      if (seenItems.has(String(id)))
        errors.push({ path: `${path}.item`, message: 'Обычный ресурс уже указан в наградах.' })
      seenItems.add(String(id))
    }
    await validateReference(reward.item, `${path}.item`, req, errors, 'ordinary-items')
  }
  if (errors.length) throw new ValidationError({ collection: 'quests', errors, req })
  return data
}

export const validateBoss: CollectionBeforeChangeHook<Boss> = async ({
  data,
  originalDoc,
  req,
}) => {
  const current = { ...originalDoc, ...data }
  const errors: ValidationFieldError[] = []
  validateCoins(current.coins, errors)
  const seen = new Set<string>()
  for (const [index, reward] of (current.rewards ?? []).entries()) {
    const path = `rewards.${index}`
    if (!Number.isSafeInteger(reward.quantity) || reward.quantity <= 0) {
      errors.push({
        path: `${path}.quantity`,
        message: 'Количество должно быть целым положительным числом.',
      })
    }
    const id = resourceID(reward.resource)
    if (id !== undefined) {
      if (seen.has(String(id)))
        errors.push({
          path: `${path}.resource`,
          message: 'Кастомный предмет уже указан в наградах.',
        })
      seen.add(String(id))
    }
    await validateReference(reward.resource, `${path}.resource`, req, errors)
  }
  if (errors.length) throw new ValidationError({ collection: 'bosses', errors, req })
  return data
}

import { ValidationError } from 'payload'
import type { CollectionBeforeChangeHook } from 'payload'
import type { Event } from '../payload-types'

const idOf = (value: number | { id: number }) => (typeof value === 'object' ? value?.id : value)

export const validateEvent: CollectionBeforeChangeHook<Event> = async ({
  data,
  originalDoc,
  req,
}) => {
  const current = { ...originalDoc, ...data }
  const errors: { path: string; message: string }[] = []
  for (const field of ['coins', 'cooldownMinutes'] as const) {
    const value = current[field]
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      errors.push({ path: field, message: 'Укажите целое неотрицательное число.' })
    }
  }

  const times = new Set<number>()
  for (const [index, time] of (current.launchTimes ?? []).entries()) {
    const id = idOf(time)
    if (id == null) {
      errors.push({ path: 'launchTimes', message: 'Выберите существующее время запуска.' })
      continue
    }
    if (times.has(id)) {
      errors.push({ path: 'launchTimes', message: 'Одно время запуска не должно повторяться.' })
    }
    times.add(id)
    const found = await req.payload.find({
      collection: 'event-times',
      where: { id: { equals: id } },
      depth: 0,
      limit: 1,
      req,
      overrideAccess: true,
    })
    if (!found.docs.length)
      errors.push({ path: `launchTimes`, message: `Время запуска №${index + 1} не существует.` })
  }

  const resources = new Set<number>()
  for (const [index, reward] of (current.rewards ?? []).entries()) {
    const path = `rewards.${index}`
    if (!Number.isSafeInteger(reward.minQuantity) || reward.minQuantity < 0) {
      errors.push({
        path: `${path}.minQuantity`,
        message: 'Минимум должен быть целым неотрицательным числом.',
      })
    }
    if (!Number.isSafeInteger(reward.maxQuantity) || reward.maxQuantity < 1) {
      errors.push({
        path: `${path}.maxQuantity`,
        message: 'Максимум должен быть целым числом не меньше 1.',
      })
    }
    if (reward.minQuantity > reward.maxQuantity) {
      errors.push({
        path: `${path}.maxQuantity`,
        message: 'Максимум не может быть меньше минимума.',
      })
    }
    const id = idOf(reward.resource)
    if (resources.has(id))
      errors.push({ path: `${path}.resource`, message: 'Кастомный предмет уже указан в наградах.' })
    resources.add(id)
    if (id == null) {
      errors.push({ path: `${path}.resource`, message: 'Выберите ресурс.' })
      continue
    }
    const found = await req.payload.find({
      collection: 'resources',
      where: { id: { equals: id } },
      depth: 0,
      limit: 1,
      req,
      overrideAccess: true,
    })
    if (!found.docs.length)
      errors.push({
        path: `${path}.resource`,
        message: 'Выбранный кастомный предмет не существует.',
      })
  }
  if (errors.length) throw new ValidationError({ collection: 'events', errors, req })
  return data
}

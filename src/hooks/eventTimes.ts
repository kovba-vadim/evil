import { APIError, ValidationError } from 'payload'
import type { CollectionBeforeDeleteHook, CollectionBeforeValidateHook } from 'payload'
import type { EventTime } from '../payload-types'

export function timeToMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length !== 5 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    return undefined
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export const deriveEventMinutes: CollectionBeforeValidateHook<EventTime> = ({
  data,
  originalDoc,
  req,
}) => {
  const time = data?.time === undefined ? originalDoc?.time : data.time
  const minutes = timeToMinutes(time)
  if (minutes === undefined) {
    throw new ValidationError({
      collection: 'event-times',
      req,
      errors: [
        {
          path: 'time',
          message: 'Укажите время по серверу UTC+3 в формате HH:mm: от 00:00 до 23:59.',
        },
      ],
    })
  }
  // Always recompute, including PATCH with only minutes, so the API cannot split these values.
  return { ...data, time, minutes }
}

export const preventEventTimeDeletion: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const used = await req.payload.find({
    collection: 'events',
    where: { launchTimes: { equals: id } },
    depth: 0,
    limit: 1,
    req,
    overrideAccess: true,
  })
  if (used.docs.length) {
    throw new APIError(
      `Нельзя удалить время: оно выбрано в ивенте «${used.docs[0].name}». Сначала уберите время из расписания ивента.`,
      400,
    )
  }
}

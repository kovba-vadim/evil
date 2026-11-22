/** Exact UTC instants. The visibility checkbox never participates in this rule. */
export function eventEndAt(startAt: string, durationMinutes: number) {
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0)
    throw new Error('Укажите положительную целую длительность ивента.')
  const end = Date.parse(startAt) + durationMinutes * 60_000
  if (!Number.isSafeInteger(end) || end > 8_640_000_000_000_000)
    throw new Error('Длительность выходит за поддерживаемый диапазон дат.')
  return new Date(end).toISOString()
}
export function launchEligible(
  startAt: string,
  durationMinutes: number,
  cooldownEndsAt: string | null,
  now: string,
) {
  const end = Date.parse(eventEndAt(startAt, durationMinutes))
  if (!cooldownEndsAt || Date.parse(cooldownEndsAt) <= Date.parse(now)) return true
  return Date.parse(cooldownEndsAt) < end
}

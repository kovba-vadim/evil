export function formatQuestCooldown(minutes: number) {
  if (minutes === 0) return 'Без КД'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainder = minutes % 60
  return [days && `${days} д.`, hours && `${hours} ч.`, remainder && `${remainder} мин.`]
    .filter(Boolean)
    .join(' ')
}

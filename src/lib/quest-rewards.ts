export type QuestRewardKind = 'resources' | 'ordinary-items'
export interface QuestRewardChoice {
  kind: QuestRewardKind
  id: number
}
export const questRewardKey = ({ kind, id }: QuestRewardChoice) => `${kind}:${id}`
export const questRewardLabels = {
  resources: 'Кастомный предмет',
  'ordinary-items': 'Обычный ресурс',
} as const

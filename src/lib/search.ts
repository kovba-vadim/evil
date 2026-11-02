export const SEARCH_TYPES = [
  { kind: 'events', label: 'Ивент' },
  { kind: 'quests', label: 'Квест' },
  { kind: 'bosses', label: 'Ивент-босс' },
  { kind: 'equipment-sets', label: 'Сет' },
  { kind: 'clothing', label: 'Одежда' },
  { kind: 'weapons', label: 'Оружие' },
  { kind: 'resources', label: 'Кастомный предмет' },
  { kind: 'ordinary-items', label: 'Обычный ресурс' },
] as const
export type SearchKind = (typeof SEARCH_TYPES)[number]['kind']
export interface SearchResult {
  key: string
  kind: SearchKind
  id: number
  name: string
  label: string
  href: string
}
export interface SearchResponse {
  results: SearchResult[]
  more: { kind: SearchKind; label: string }[]
}
export const SEARCH_MIN_LENGTH = 2
export const SEARCH_MAX_LENGTH = 100
export function searchLength(query: string) {
  return Array.from(query).length
}
export function parseSearchQuery(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Запрос должен быть строкой.')
  const query = value.trim()
  if (/[\u0000-\u001f\u007f]/.test(query)) throw new Error('Запрос содержит недопустимые символы.')
  if (searchLength(query) > SEARCH_MAX_LENGTH) throw new Error('Запрос слишком длинный.')
  return query
}

import type { GlobalConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { seoTab } from '../fields/seo'

export const catalogTitles = {
  'bosses-page': 'Ивент-боссы',
  'events-page': 'Ивенты',
  'event-launches-page': 'Запуск ивентов',
  'quests-page': 'Квесты',
  'items-page': 'Кастом предметы',
  'craft-page': 'Craft',
  'clothing-page': 'Кастом одежда',
  'weapons-page': 'Кастом оружие',
}

export const CatalogSeo: GlobalConfig[] = Object.entries(catalogTitles).map(([slug, label]) => ({
  slug,
  label,
  admin: { group: 'Публичные страницы' },
  access: { read: () => true, update: authenticated },
  fields: [{ type: 'tabs', tabs: [seoTab] }],
}))

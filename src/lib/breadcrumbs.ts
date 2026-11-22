export const breadcrumbSections = {
  events: { title: 'Ивенты', href: '/events' },
  quests: { title: 'Квесты', href: '/quests' },
  bosses: { title: 'Ивент-боссы', href: '/bosses' },
  clothing: { title: 'Одежда', href: '/clothing' },
  weapons: { title: 'Оружие', href: '/weapons' },
  items: { title: 'Кастомные предметы', href: '/items' },
  craft: { title: 'Craft', href: '/craft' },
} as const

export type BreadcrumbSection = keyof typeof breadcrumbSections

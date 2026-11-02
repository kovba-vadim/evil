import {
  CalendarDays,
  Clock3,
  Hammer,
  Package,
  Shirt,
  Skull,
  Swords,
  ScrollText,
} from 'lucide-react'

export const navigation = [
  { title: 'Ивенты', href: '/events', icon: CalendarDays },
  { title: 'Квесты', href: '/quests', icon: ScrollText },
  { title: 'Ивент-боссы', href: '/bosses', icon: Skull },
  { title: 'Кастом одежда', href: '/clothing', icon: Shirt },
  { title: 'Кастом оружие', href: '/weapons', icon: Swords },
  { title: 'Кастом предметы', href: '/items', icon: Package },
  { title: 'Craft', href: '/craft', icon: Hammer },
  { title: 'Запуск ивентов', href: '/event-launches', icon: Clock3 },
] as const

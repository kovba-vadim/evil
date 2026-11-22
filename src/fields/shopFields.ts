import type { GroupField } from 'payload'
import { isStandaloneClothing } from '../lib/shop'

export function shopFields({ clothing = false } = {}): GroupField {
  return {
    name: 'shop',
    type: 'group',
    label: 'Покупка в магазине',
    hooks: {
      beforeValidate: [({ value }) => (value === null ? { enabled: false } : undefined)],
    },
    ...(clothing && {
      admin: {
        condition: (data) => isStandaloneClothing(data.category),
        description: 'Перед переводом предмета в часть сета отключите покупку.',
      },
    }),
    fields: [
      { name: 'enabled', type: 'checkbox', label: 'Можно купить в магазине', defaultValue: false },
      {
        name: 'price',
        type: 'number',
        label: 'Стоимость в рублях',
        min: 1,
        admin: { condition: (_, shop) => shop.enabled === true },
      },
      {
        name: 'url',
        type: 'text',
        label: 'Ссылка на товар в магазине',
        admin: { condition: (_, shop) => shop.enabled === true },
      },
    ],
  }
}

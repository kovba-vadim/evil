import { withSeoTab } from '../fields/seo'
import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { validateBoss } from '../hooks/questBossRewards'
import { migrateBossRewards, prepareBossRewardRows, readBossRewards } from '../hooks/bossRewards'

export const Bosses: CollectionConfig = {
  slug: 'bosses',
  orderable: true,
  labels: { singular: 'Ивент-босс', plural: 'Ивент-боссы' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'rewards', 'coins'] },
  forceSelect: { rewards: true, goldenHeart: true, personalHeart: true },
  access: {
    read: () => true,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: {
    beforeValidate: [migrateBossRewards],
    beforeChange: [validateBoss],
    afterRead: [readBossRewards],
  },
  fields: withSeoTab([
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    { name: 'image', label: 'Изображение', type: 'upload', relationTo: 'media' },
    { name: 'description', label: 'Описание', type: 'richText' },
    { name: 'coins', label: 'Монеты', type: 'number', required: true, min: 0, defaultValue: 0 },
    {
      name: 'rewards',
      label: 'Награды',
      type: 'array',
      labels: { singular: 'Награда', plural: 'Награды' },
      hooks: { beforeValidate: [prepareBossRewardRows] },
      admin: { description: 'Выберите кастомные предметы и количество каждого. Без повторов.' },
      fields: [
        {
          name: 'resource',
          label: 'Кастомный предмет',
          type: 'relationship',
          relationTo: 'resources',
          required: true,
        },
        {
          name: 'quantity',
          label: 'Количество',
          type: 'number',
          required: true,
          min: 1,
          defaultValue: 1,
          validate: (value: unknown) =>
            (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) ||
            'Укажите положительное целое число.',
        },
      ],
    },
    // Keep legacy columns during development schema push until backfill is verified.
    {
      name: 'goldenHeart',
      label: 'Прежняя награда (золотое сердце)',
      type: 'relationship',
      relationTo: 'resources',
      admin: {
        hidden: true,
        readOnly: true,
        disableBulkEdit: true,
        disableListColumn: true,
        disableListFilter: true,
      },
    },
    {
      name: 'personalHeart',
      label: 'Прежняя награда (персональное сердце)',
      type: 'relationship',
      relationTo: 'resources',
      admin: {
        hidden: true,
        readOnly: true,
        disableBulkEdit: true,
        disableListColumn: true,
        disableListFilter: true,
      },
    },
  ]),
}

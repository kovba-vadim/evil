import type { CollectionConfig } from 'payload'
import { authenticated } from '../access/authenticated'
import { itemSlug } from '../fields/itemSlug'
import { preventSetDeletion } from '../hooks/equipmentSets'

export const EquipmentSets: CollectionConfig = {
  slug: 'equipment-sets',
  orderable: true,
  labels: { singular: 'Сет', plural: 'Сеты' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'slug', 'updatedAt'] },
  access: {
    read: authenticated,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: { beforeDelete: [preventSetDeletion] },
  fields: [
    { name: 'name', label: 'Название', type: 'text', required: true },
    itemSlug(),
    { name: 'image', label: 'Изображение', type: 'upload', relationTo: 'media' },
    { name: 'description', label: 'Описание', type: 'richText' },
    {
      name: 'parts',
      label: 'Состав сета',
      type: 'join',
      collection: 'clothing',
      on: 'equipmentSet',
      admin: {
        allowCreate: false,
        defaultColumns: ['name', 'updatedAt'],
        description: 'Состав определяется связью «Сет» в одежде. Число частей не ограничено.',
      },
    },
  ],
}

import { slugField } from 'payload'

export const itemSlug = () =>
  slugField({
    useAsSlug: 'name',
    slugify: ({ valueToSlugify }) =>
      typeof valueToSlugify === 'string'
        ? valueToSlugify
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\p{L}\p{N}_-]/gu, '')
        : '',
    overrides: (field) => {
      for (const child of field.fields) {
        if ('name' in child && child.name === 'slug') child.label = 'Слаг'
        if ('name' in child && child.name === 'generateSlug') {
          child.label = 'Генерировать слаг'
          child.admin = {
            ...child.admin,
            description: 'Создавать слаг из названия при сохранении.',
          }
        }
      }
      return field
    },
  })

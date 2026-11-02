import { slugField } from 'payload'
import { slugifyItemName } from './slugifyItemName'

export const itemSlug = () =>
  slugField({
    useAsSlug: 'name',
    slugify: ({ valueToSlugify }) => slugifyItemName(valueToSlugify),
    overrides: (field) => {
      for (const child of field.fields) {
        if ('name' in child && child.type === 'text' && child.name === 'slug') {
          child.label = 'Слаг'
          child.admin = {
            ...child.admin,
            components: {
              ...child.admin?.components,
              Field: {
                path: '/fields/ItemSlugField#ItemSlugField',
                clientProps: { useAsSlug: 'name' },
              },
            },
          }
          child.hooks = {
            ...child.hooks,
            beforeValidate: [
              ({ value, data, originalDoc, operation }) => {
                // Preserve explicit values exactly, including existing Cyrillic slugs.
                if (typeof value === 'string' && value.trim()) return value
                if (operation === 'update' && originalDoc?.slug) return originalDoc.slug
                return slugifyItemName(data?.name ?? originalDoc?.name)
              },
            ],
          }
        }
        if (child.type === 'checkbox' && child.name === 'generateSlug') {
          child.label = 'Генерировать слаг'
          // Native beforeChange can overwrite manual/existing values. Generation now
          // happens on the slug itself before validation, independently of this flag.
          child.hooks = { beforeChange: [() => false] }
          child.admin = {
            ...child.admin,
            description: 'Слаг новой записи автоматически заполняется из названия.',
          }
        }
      }
      return field
    },
  })

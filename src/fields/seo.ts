import type { Field, Tab } from 'payload'

export const seoTab: Tab = {
  name: 'seo',
  label: 'SEO',
  fields: [
    { name: 'title', type: 'text', label: 'SEO-заголовок' },
    { name: 'description', type: 'textarea', label: 'Метаописание' },
  ],
}

export function withSeoTab(fields: Field[]): Field[] {
  return [{ type: 'tabs', tabs: [{ label: 'Основное', fields }, seoTab] }]
}

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Breadcrumbs } from '@/components/public/breadcrumbs'
import { breadcrumbSections } from '@/lib/breadcrumbs'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))

describe('fixed breadcrumb parents', () => {
  it.each(Object.entries(breadcrumbSections))(
    'renders %s without a router context',
    (key, parent) => {
      const html = renderToStaticMarkup(
        createElement(Breadcrumbs, {
          section: key as keyof typeof breadcrumbSections,
          title: 'Запись',
        }),
      )
      expect(html).toContain(`href="${parent.href}"`)
      expect(html).toContain(parent.title)
      expect(html).toContain('aria-current="page"')
      expect(html).toContain('Назад')
    },
  )
})

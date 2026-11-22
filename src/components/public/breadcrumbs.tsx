import Link from 'next/link'
import { breadcrumbSections, type BreadcrumbSection } from '@/lib/breadcrumbs'
import { BackButton } from './back-button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export function Breadcrumbs({ section, title }: { section: BreadcrumbSection; title: string }) {
  const parent = breadcrumbSections[section]
  return (
    <div className="detail-navigation">
      <Breadcrumb className="breadcrumbs" aria-label="Хлебные крошки">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={parent.href}>{parent.title}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <BackButton fallback={parent.href} />
    </div>
  )
}

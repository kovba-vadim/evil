import Link from 'next/link'
import type { CraftCard, ItemCard } from '@/queries/public-items'
import { publicRecordURL } from '@/lib/public-record-url'
import { ItemImage } from './item-image'

export function ResourceCatalog({ items }: { items: ItemCard[] }) {
  return (
    <section aria-labelledby="catalog-title" className="space-y-6">
      <h1 id="catalog-title" className="text-3xl font-semibold tracking-tight">
        Кастом предметы
      </h1>
      <ItemCards
        items={items}
        collection="resources"
        emptyMessage="Кастомные предметы пока не добавлены."
      />
    </section>
  )
}

export function ItemCards({
  items,
  collection,
  emptyMessage,
  showType,
}: {
  emptyMessage: string
} & (
  | { items: CraftCard[]; showType: true; collection?: never }
  | {
      items: ItemCard[]
      showType?: false
      collection: 'resources' | 'clothing' | 'weapons' | 'equipment-sets'
    }
)) {
  return (
    <>
      {items.length ? (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={`${showType ? (item as CraftCard).kind : collection}-${item.id}`}>
              <Link
                href={publicRecordURL(
                  showType ? (item as CraftCard).kind : collection!,
                  item.slug,
                )!}
                aria-label={item.name}
                className="block h-full space-y-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <ItemImage image={item.image} name={item.name} />
                <p className="px-1 pb-1 font-medium wrap-anywhere">{item.name}</p>
                {showType && (
                  <p className="px-1 pb-1 text-sm text-muted-foreground">
                    {craftLabels[(item as CraftCard).kind]}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{emptyMessage}</p>
      )}
    </>
  )
}

const craftLabels = {
  resources: 'Кастомный предмет',
  clothing: 'Одежда',
  weapons: 'Оружие',
} as const

import Link from 'next/link'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { OrdinaryItem } from '@/payload-types'
import type {
  EquipmentDetail,
  ItemCard,
  PublicRecipe,
  ResourceDetail,
} from '@/queries/public-items'
import { publicRecordURL } from '@/lib/public-record-url'
import { ItemImage } from './item-image'

export function ItemHeading({
  item,
}: {
  item: ItemCard & { description: OrdinaryItem['description'] }
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight wrap-anywhere">{item.name}</h1>
      <ItemImage
        image={item.image}
        name={item.name}
        className="aspect-video max-w-2xl"
        sizes="(min-width: 1024px) 672px, 100vw"
      />
      {item.description && <RichText data={item.description} className="homepage-richtext" />}
    </div>
  )
}

export function Recipe({ recipe }: { recipe: PublicRecipe }) {
  return (
    <section aria-labelledby="recipe-title" className="space-y-4">
      <h2 id="recipe-title" className="text-xl font-semibold">
        Как скрафтить
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {recipe.ingredients.map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <Link
              href={publicRecordURL(item.kind, item.slug)!}
              className="flex h-full items-center gap-3 rounded-lg border p-3 hover:border-primary"
            >
              <ItemImage
                image={item.image}
                name={item.name}
                className="size-16 shrink-0"
                sizes="64px"
              />
              <div className="min-w-0 flex-1">
                <span className="font-medium wrap-anywhere">{item.name}</span>
                <p className="text-sm text-muted-foreground">Количество: {item.quantity}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        Стоимость в монетах: <span className="font-semibold">{recipe.coins}</span>
      </p>
    </section>
  )
}

const sourceLabels = { events: 'Ивент', quests: 'Квест', bosses: 'Ивент-босс' } as const
const useLabels = { resources: 'Кастомный предмет', clothing: 'Одежда', weapons: 'Оружие' } as const

export function ResourceDetails({ detail }: { detail: ResourceDetail }) {
  return (
    <article className="max-w-4xl space-y-9">
      <Link href="/items" className="text-sm text-primary underline underline-offset-4">
        Все кастомные предметы
      </Link>
      <ItemHeading item={detail.item} />
      {detail.sources.length > 0 && (
        <section aria-labelledby="sources-title" className="space-y-4">
          <h2 id="sources-title" className="text-xl font-semibold">
            Где получить
          </h2>
          <ul className="divide-y rounded-lg border px-4">
            {detail.sources.map((source) => (
              <li
                key={`${source.kind}-${source.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 py-3"
              >
                <div>
                  <span className="text-xs text-muted-foreground">{sourceLabels[source.kind]}</span>
                  <p className="font-medium wrap-anywhere">
                    {source.slug ? (
                      <Link
                        className="text-primary underline underline-offset-4"
                        href={publicRecordURL(source.kind, source.slug)!}
                      >
                        {source.name}
                      </Link>
                    ) : (
                      source.name
                    )}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">
                  Количество:{' '}
                  {source.kind === 'events'
                    ? `${source.minimum}–${source.maximum}`
                    : source.minimum}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {detail.recipe && <Recipe recipe={detail.recipe} />}
      {detail.uses.length > 0 && (
        <section aria-labelledby="uses-title" className="space-y-4">
          <h2 id="uses-title" className="text-xl font-semibold">
            Используется в крафте
          </h2>
          <ul className="divide-y rounded-lg border px-4">
            {detail.uses.map((item) => {
              const href = publicRecordURL(item.kind, item.slug)
              return (
                <li key={`${item.kind}-${item.id}`} className="py-3">
                  <span className="text-xs text-muted-foreground">{useLabels[item.kind]}</span>
                  <p>
                    {href ? (
                      <Link
                        href={href}
                        className="font-medium text-primary underline underline-offset-4"
                      >
                        {item.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{item.name}</span>
                    )}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </article>
  )
}

export function OrdinaryDetails({
  item,
}: {
  item: ItemCard & { description: OrdinaryItem['description'] }
}) {
  return (
    <article className="max-w-3xl">
      <ItemHeading item={item} />
    </article>
  )
}

export function EquipmentDetails({ detail }: { detail: EquipmentDetail }) {
  return (
    <article className="max-w-4xl space-y-9">
      <ItemHeading item={detail.item} />
      {detail.setName && (
        <p>
          Сет:{' '}
          <Link
            className="font-medium text-primary underline underline-offset-4"
            href={publicRecordURL('equipment-sets', detail.setSlug!)!}
          >
            {detail.setName}
          </Link>
        </p>
      )}
      {detail.recipe && <Recipe recipe={detail.recipe} />}
    </article>
  )
}

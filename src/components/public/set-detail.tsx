import Link from 'next/link'
import type { getSetDetail } from '@/queries/public-items'
import { publicRecordURL } from '@/lib/public-record-url'
import { ItemHeading, Recipe } from './item-detail'
import { ItemImage } from './item-image'

export function SetDetails({
  detail,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getSetDetail>>>
}) {
  return (
    <article className="space-y-9">
      <ItemHeading item={detail.item} />
      <section aria-labelledby="parts-title" className="space-y-6">
        <h2 id="parts-title" className="text-xl font-semibold">
          Состав сета
        </h2>
        {detail.parts.length ? (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {detail.parts.map((part) => (
              <li key={part.id} className="h-full space-y-3 rounded-lg border bg-card p-3">
                <ItemImage image={part.image} name={part.name} />
                <h3 className="px-1 font-medium wrap-anywhere">{part.name}</h3>
                {part.recipe ? (
                  <div className="space-y-3 px-1 pb-1 text-sm">
                    <ul className="space-y-2">
                      {part.recipe.ingredients.map((item) => (
                        <li key={item.id} className="wrap-anywhere">
                          <Link
                            href={publicRecordURL('resources', item.slug)!}
                            className="text-primary underline underline-offset-4"
                          >
                            {item.name}
                          </Link>{' '}
                          × {item.quantity}
                        </li>
                      ))}
                    </ul>
                    <p>
                      Стоимость в монетах:{' '}
                      <span className="font-semibold">{part.recipe.coins}</span>
                    </p>
                    {part.missingIngredients && (
                      <p className="text-muted-foreground">Часть данных рецепта недоступна.</p>
                    )}
                  </div>
                ) : (
                  <p className="px-1 pb-1 text-sm text-muted-foreground">Рецепт не указан.</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Части сета пока не добавлены.</p>
        )}
      </section>
      {detail.parts.length > 0 && (
        <div className="space-y-4">
          <Recipe recipe={detail.totalRecipe} title="Всего для крафта сета" />
          {detail.incomplete && (
            <p className="text-sm text-muted-foreground">
              Итог рассчитан по доступным данным. У некоторых частей рецепт отсутствует или заполнен
              не полностью.
            </p>
          )}
        </div>
      )}
    </article>
  )
}

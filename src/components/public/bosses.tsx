import Link from 'next/link'
import type { BossCard, BossDetail } from '@/queries/public-items'
import { publicRecordURL } from '@/lib/public-record-url'
import { ItemImage } from './item-image'
import { ItemHeading } from './item-detail'

function BossRewards({ rewards }: { rewards: BossCard['rewards'] }) {
  return rewards.length ? (
    <ul className="space-y-2">
      {rewards.map((reward) => (
        <li key={reward.id} className="flex flex-wrap justify-between gap-2">
          <Link
            className="text-primary underline underline-offset-4 wrap-anywhere"
            href={publicRecordURL('resources', reward.slug)!}
          >
            {reward.name}
          </Link>
          <span className="text-sm text-muted-foreground">Количество333: {reward.quantity}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-muted-foreground">Предметные награды пока не указаны.</p>
  )
}
export function BossCatalog({ items }: { items: BossCard[] }) {
  return (
    <section aria-labelledby="bosses-title" className="space-y-6">
      <h1 id="bosses-title" className="text-3xl font-semibold tracking-tight">
        Ивент-боссы
      </h1>
      {items.length ? (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} className="space-y-4 rounded-lg border bg-card p-3">
              <Link
                aria-label={item.name}
                href={publicRecordURL('bosses', item.slug)!}
                className="block space-y-3 rounded-md focus-visible:outline-2 focus-visible:outline-primary"
              >
                <ItemImage image={item.image} name={item.name} />
                <h2 className="font-medium wrap-anywhere">{item.name}</h2>
              </Link>
              <p>Монеты333: {item.coins}</p>
              <div className="space-y-2">
                <p className="text-sm font-medium">Возможные награды</p>
                <BossRewards rewards={item.rewards} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Ивент-боссы пока не добавлены.</p>
      )}
    </section>
  )
}
export function BossDetails({ detail }: { detail: BossDetail }) {
  return (
    <article className="max-w-4xl space-y-9">
      <ItemHeading item={detail.item} />
      <p>Монеты111: {detail.coins}</p>
      <section aria-labelledby="rewards-title" className="space-y-4">
        <h2 id="rewards-title" className="text-xl font-semibold">
          Возможные награды
        </h2>
        <BossRewards rewards={detail.rewards} />
      </section>
    </article>
  )
}

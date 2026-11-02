import Link from 'next/link'
import type { PublicEvent } from '@/queries/public-events'
import { publicRecordURL } from '@/lib/public-record-url'
export function EventRewards({ rewards }: { rewards: PublicEvent['rewards'] }) {
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
          <span className="text-sm text-muted-foreground">
            Количество: {reward.minimum}–{reward.maximum}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-muted-foreground">Предметные награды пока не указаны.</p>
  )
}
export function EventCards({ events }: { events: PublicEvent[] }) {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {events.map((event) => (
        <li key={event.id} className="space-y-4 rounded-lg border bg-card p-4">
          <Link
            className="block font-medium text-primary underline underline-offset-4 wrap-anywhere"
            href={publicRecordURL('events', event.slug)!}
          >
            {event.name}
          </Link>
          {event.shortDescription && (
            <p className="text-sm wrap-anywhere">{event.shortDescription}</p>
          )}
          <p>Монеты: {event.coins}</p>
          <EventRewards rewards={event.rewards} />
        </li>
      ))}
    </ul>
  )
}

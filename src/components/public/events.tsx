import Link from 'next/link'
import type { PublicEvent } from '@/queries/public-events'
import { publicRecordURL } from '@/lib/public-record-url'
import { formatRewardQuantity, RewardCoins } from './reward-labels'
import { EventReminderBell } from './catalog-reminders'
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
            {formatRewardQuantity(reward.minimum, reward.maximum)}
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
          <div className="flex items-start justify-between gap-2">
            <Link
              className="min-w-0 self-center font-medium text-primary underline underline-offset-4 wrap-anywhere"
              href={publicRecordURL('events', event.slug)!}
            >
              {event.name}
            </Link>
            <EventReminderBell event={event} />
          </div>
          {event.shortDescription && (
            <p className="text-sm wrap-anywhere">{event.shortDescription}</p>
          )}
          <RewardCoins coins={event.coins} />
          <EventRewards rewards={event.rewards} />
        </li>
      ))}
    </ul>
  )
}

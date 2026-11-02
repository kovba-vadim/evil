import type { Metadata } from 'next'
import Link from 'next/link'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getPublicEventDetail } from '@/queries/public-events'
import { EventLaunchTimes } from '@/components/public/event-launch-times'
import { EventRewards } from '@/components/public/events'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ивент' }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const detail = await getPublicEventDetail(await getPayload({ config }), slug)
  if (!detail) notFound()
  const { event } = detail
  return (
    <article className="max-w-4xl space-y-6">
      <Link href="/events" className="text-primary underline">
        Все ивенты
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight wrap-anywhere">{event.name}</h1>
      {event.shortDescription && <p>{event.shortDescription}</p>}
      {detail.description && <RichText data={detail.description} className="homepage-richtext" />}
      <p>Монеты: {event.coins}</p>
      <section aria-labelledby="event-rewards" className="space-y-4">
        <h2 id="event-rewards" className="text-xl font-semibold">
          Возможные награды
        </h2>
        <EventRewards rewards={event.rewards} />
      </section>
      <EventLaunchTimes times={detail.times} initialNow={new Date().toISOString()} />
      <p>КД прохождения: {detail.cooldownMinutes} мин.</p>
    </article>
  )
}

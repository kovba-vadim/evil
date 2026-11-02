import type { Metadata } from 'next'
import Link from 'next/link'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getPublicQuestDetail } from '@/queries/public-quests'
import { QuestFacts, QuestRewards } from '@/components/public/quests'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Квест' }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    detail = await getPublicQuestDetail(await getPayload({ config }), slug)
  if (!detail) notFound()
  return (
    <article className="max-w-4xl space-y-6">
      <Link href="/quests" className="text-primary underline">
        Все квесты
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight wrap-anywhere">{detail.quest.name}</h1>
      <QuestFacts quest={detail.quest} />
      {detail.description && <RichText data={detail.description} className="homepage-richtext" />}
      {detail.quest.rewards.length > 0 && (
        <section aria-labelledby="quest-rewards" className="space-y-4">
          <h2 id="quest-rewards" className="text-xl font-semibold">
            Возможные награды
          </h2>
          <QuestRewards rewards={detail.quest.rewards} />
        </section>
      )}
    </article>
  )
}

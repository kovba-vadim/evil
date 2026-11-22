import { Breadcrumbs } from '@/components/public/breadcrumbs'
import { getEntryMetadata } from '@/queries/public-seo'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getPublicQuestDetail } from '@/queries/public-quests'
import { QuestFacts, QuestRewards } from '@/components/public/quests'
import { playerSession } from '@/auth/players'
import { getPlayerQuestCooldowns } from '@/queries/player-cooldowns'
import { PlayerCooldowns, QuestCooldownGuest } from '@/components/public/player-cooldowns'
export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return getEntryMetadata('quests', (await params).slug, 'Квест')
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    detail = await getPublicQuestDetail(await getPayload({ config }), slug)
  if (!detail) notFound()
  const session = detail.quest.cooldown > 0 ? await playerSession() : null
  return (
    <article className="max-w-4xl space-y-6">
      <Breadcrumbs section="quests" title={detail.quest.name} />
      <h1 className="text-3xl font-semibold tracking-tight wrap-anywhere">{detail.quest.name}</h1>
      <QuestFacts quest={detail.quest} />
      {session &&
        (session.user ? (
          <PlayerCooldowns
            key={`${session.user.id}:${detail.quest.id}`}
            initial={await getPlayerQuestCooldowns(session.payload, session.user, detail.quest.id)}
            questID={detail.quest.id}
            timeZone={session.user.timeZone}
            quest
          />
        ) : (
          <QuestCooldownGuest slug={detail.quest.slug} />
        ))}
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

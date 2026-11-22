import type { Metadata } from 'next'
import { requireAccountPlayer } from '@/auth/account-page'
import { PlayerCooldowns } from '@/components/public/player-cooldowns'
import { getPlayerCooldowns, getPlayerQuestCooldowns } from '@/queries/player-cooldowns'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Мои КД', robots: { index: false, follow: false } }

export default async function AccountCooldownsPage() {
  const { payload, user } = await requireAccountPlayer('/account/cooldowns')
  const [events, quests] = await Promise.all([
    getPlayerCooldowns(payload, user),
    getPlayerQuestCooldowns(payload, user),
  ])
  return (
    <section className="account" aria-labelledby="account-cooldowns-title">
      <h1 id="account-cooldowns-title">Мои КД</h1>
      <PlayerCooldowns
        key={user.id}
        initial={events}
        timeZone={user.timeZone}
        listTitle="КД ивентов"
      />
      <PlayerCooldowns
        key={`quests:${user.id}`}
        initial={quests}
        timeZone={user.timeZone}
        listTitle="КД квестов"
        quest
      />
    </section>
  )
}
